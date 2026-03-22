package main

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// PdfConvertResult is returned from ConvertToPdfAndImages.
type PdfConvertResult struct {
	Success   bool     `json:"success"`
	PdfBase64 string   `json:"pdf_base64"` // PDF bytes (may be empty for xlsx image export)
	Pages     []string `json:"pages"`      // per-page PNG base64
	PageCount int      `json:"page_count"`
	Error     string   `json:"error,omitempty"`
}

// ConvertToPdfAndImages converts hwp/hwpx/xlsx to PDF then returns per-page PNG images.
//
//   - HWP/HWPX : Uses the Hancom COM worker to (1) export PDF and (2) export per-page PNGs.
//   - XLSX/XLS : Uses Excel COM via PowerShell to export each page as PNG (ExportAsFixedFormat+render).
//   - PDF      : Copies the PDF and attempts WinRT page conversion; falls back gracefully.
func (a *App) ConvertToPdfAndImages(inputName string, inputBase64 string) PdfConvertResult {
	// Sanitize inputName
	safeInputName := filepath.Base(inputName)
	log.Printf("[PdfConv] Start: %s", safeInputName)

	fileData, err := base64.StdEncoding.DecodeString(inputBase64)
	if err != nil {
		return PdfConvertResult{Error: "데이터 디코딩 실패"}
	}

	tmpDir, err := os.MkdirTemp("", "pdfconv_")
	if err != nil {
		return PdfConvertResult{Error: "임시 폴더 생성 실패"}
	}
	defer os.RemoveAll(tmpDir)

	inputPath := filepath.Join(tmpDir, safeInputName)
	if err := os.WriteFile(inputPath, fileData, 0644); err != nil {
		return PdfConvertResult{Error: "임시 파일 저장 실패"}
	}

	ext := strings.ToLower(filepath.Ext(safeInputName))
	baseName := strings.TrimSuffix(safeInputName, filepath.Ext(safeInputName))
	pdfPath := filepath.Join(tmpDir, baseName+".pdf")
	imgDir := filepath.Join(tmpDir, "pages")
	os.MkdirAll(imgDir, 0755)

	var pages []string
	var pdfData []byte

	switch ext {
	case ".hwp", ".hwpx":
		// Step 1: export PDF via HWP COM
		if errPdf := a.convertHwpToPdf(inputPath, pdfPath, ext); errPdf == nil {
			if d, e := os.ReadFile(pdfPath); e == nil {
				pdfData = d
			}
		}
		// Step 2: export per-page PNGs via HWP COM (uses the existing image export path)
		pages = a.extractHwpPages(inputPath, imgDir, ext)

	case ".xlsx", ".xls":
		// Export PDF via Excel COM
		if errPdf := convertExcelToPdfDirect(inputPath, pdfPath); errPdf == nil {
			if d, e := os.ReadFile(pdfPath); e == nil {
				pdfData = d
			}
		}
		// Export per-page images via Excel COM
		pages = extractExcelPages(inputPath, imgDir)

	case ".pdf":
		// PDF is already a PDF — just render per-page PNGs
		if d, e := os.ReadFile(inputPath); e == nil {
			pdfData = d
		}
		pages = renderPdfToPages(inputPath, imgDir)

	default:
		return PdfConvertResult{Error: "지원하지 않는 파일 형식: " + ext}
	}

	if len(pages) == 0 {
		return PdfConvertResult{Error: "페이지 이미지를 생성하지 못했습니다"}
	}

	result := PdfConvertResult{
		Success:   true,
		Pages:     pages,
		PageCount: len(pages),
	}
	if len(pdfData) > 0 {
		result.PdfBase64 = base64.StdEncoding.EncodeToString(pdfData)
	}
	return result
}

// ─── HWP helpers ────────────────────────────────────────────────────────────

// convertHwpToPdf sends a task to the HWP COM worker requesting PDF output.
func (a *App) convertHwpToPdf(inputPath, outputPath, _ string) error {
	respChan := make(chan error, 1)
	a.hwpTaskChan <- hwpTask{inputPath, outputPath, "pdf", respChan}
	select {
	case err := <-respChan:
		return err
	case <-time.After(120 * time.Second):
		return fmt.Errorf("HWP→PDF 변환 시간 초과")
	}
}

// extractHwpPages converts HWP to PDF first, then renders each PDF page as PNG.
// This avoids the HWP facing-pages (맞쪽) issue where FileSaveAs_S merges two pages into one image.
func (a *App) extractHwpPages(inputPath, outDir, ext string) []string {
	// Step 1: HWP → PDF (already reliable)
	pdfPath := filepath.Join(outDir, "hwp_temp.pdf")
	if err := a.convertHwpToPdf(inputPath, pdfPath, ext); err != nil {
		log.Printf("[PdfConv] HWP→PDF failed: %v, falling back to direct image export", err)
		return a.extractHwpPagesDirect(inputPath, outDir)
	}

	// Step 2: Copy PDF to release any file locks from the printer spooler
	pdfCopy := filepath.Join(outDir, "render_input.pdf")
	var copyErr error
	for attempt := 0; attempt < 20; attempt++ {
		data, err := os.ReadFile(pdfPath)
		if err == nil && len(data) > 1000 {
			copyErr = os.WriteFile(pdfCopy, data, 0644)
			break
		}
		copyErr = err
		time.Sleep(300 * time.Millisecond)
	}
	if copyErr != nil {
		log.Printf("[PdfConv] Failed to copy PDF for rendering: %v", copyErr)
	}

	// Step 3: PDF → per-page PNG using Windows.Data.Pdf WinRT via PowerShell
	pages := renderPdfToPages(pdfCopy, outDir)
	if len(pages) > 0 {
		return pages
	}

	// Fallback: direct HWP image export
	log.Printf("[PdfConv] PDF→PNG render failed, falling back to direct image export")
	return a.extractHwpPagesDirect(inputPath, outDir)
}

// renderPdfToPages uses Windows.Data.Pdf WinRT API via PowerShell to render each PDF page as PNG.
// Loads PDF from a memory stream (avoids WinRT file-path access restrictions on Temp folders).
func renderPdfToPages(pdfPath, outDir string) []string {
	psScript := `
param([string]$PdfPath, [string]$OutDir)

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod
    })[0]
    $asTaskVoid = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and -not $_.IsGenericMethod
    })[0]

    Function AwaitResult($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        $netTask.Result
    }
    Function AwaitVoid($WinRtTask) {
        $netTask = $asTaskVoid.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
    }

    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null

    # Load PDF bytes into a WinRT InMemoryRandomAccessStream (bypasses file-path restrictions)
    $pdfBytes = [System.IO.File]::ReadAllBytes($PdfPath)
    $pdfStream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $writer = New-Object Windows.Storage.Streams.DataWriter($pdfStream)
    $writer.WriteBytes($pdfBytes)
    AwaitResult ($writer.StoreAsync()) ([uint32])
    $writer.DetachStream() | Out-Null
    $pdfStream.Seek(0)

    $pdf = AwaitResult ([Windows.Data.Pdf.PdfDocument]::LoadFromStreamAsync($pdfStream)) ([Windows.Data.Pdf.PdfDocument])

    Write-Host "PAGECOUNT:$($pdf.PageCount)"

    for ($i = 0; $i -lt $pdf.PageCount; $i++) {
        $page = $pdf.GetPage($i)
        $imgStream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
        AwaitVoid ($page.RenderToStreamAsync($imgStream))

        $outPath = Join-Path $OutDir ("page_{0:D4}.png" -f ($i + 1))
        $fileStream = [System.IO.File]::Create($outPath)
        $imgStream.Seek(0) | Out-Null
        $reader = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($imgStream)
        $reader.CopyTo($fileStream)
        $fileStream.Close()
        $reader.Dispose()
        $imgStream.Dispose()
        $page.Dispose()
        Write-Host "PAGE:$outPath"
    }

    $pdfStream.Dispose()
} catch {
    Write-Host "ERROR:$($_.Exception.Message)"
    if ($_.Exception.InnerException) {
        Write-Host "INNER:$($_.Exception.InnerException.Message)"
    }
}
`
	scriptPath := filepath.Join(outDir, "_render.ps1")
	if err := os.WriteFile(scriptPath, []byte(psScript), 0644); err != nil {
		log.Printf("[PdfConv] Failed to write PS script: %v", err)
		return nil
	}

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-File", scriptPath,
		"-PdfPath", pdfPath,
		"-OutDir", outDir)
	out, err := cmd.CombinedOutput()
	output := string(out)
	log.Printf("[PdfConv] PDF→PNG render output:\n%s", output)

	if err != nil {
		log.Printf("[PdfConv] PDF→PNG render error: %v", err)
	}

	// Collect from PAGE: lines
	var pages []string
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "PAGE:") {
			imgPath := strings.TrimSpace(strings.TrimPrefix(line, "PAGE:"))
			data, readErr := os.ReadFile(imgPath)
			if readErr == nil && len(data) > 100 {
				pages = append(pages, base64.StdEncoding.EncodeToString(data))
			}
		}
	}

	// Fallback: glob
	if len(pages) == 0 {
		matches, _ := filepath.Glob(filepath.Join(outDir, "page_*.png"))
		sort.Strings(matches)
		for _, m := range matches {
			data, readErr := os.ReadFile(m)
			if readErr == nil && len(data) > 100 {
				pages = append(pages, base64.StdEncoding.EncodeToString(data))
			}
		}
	}

	log.Printf("[PdfConv] PDF→PNG rendered %d pages", len(pages))
	return pages
}

// extractHwpPagesDirect is the legacy fallback: uses HWP COM FileSaveAs_S in "pages" mode.
func (a *App) extractHwpPagesDirect(inputPath, outDir string) []string {
	sentinel := filepath.Join(outDir, "out.png")

	respChan := make(chan error, 1)
	a.hwpTaskChan <- hwpTask{inputPath, sentinel, "pages", respChan}

	select {
	case err := <-respChan:
		if err != nil {
			log.Printf("[PdfConv] HWP direct pages export error: %v", err)
			return nil
		}
	case <-time.After(120 * time.Second):
		log.Printf("[PdfConv] HWP direct pages export timed out")
		return nil
	}

	matches, _ := filepath.Glob(filepath.Join(outDir, "out*.png"))
	sort.Strings(matches)

	var pages []string
	for _, m := range matches {
		if filepath.Base(m) == "out.png" {
			continue
		}
		var data []byte
		var err error
		for retry := 0; retry < 5; retry++ {
			data, err = os.ReadFile(m)
			if err == nil && len(data) > 100 {
				break
			}
			time.Sleep(200 * time.Millisecond)
		}
		if err == nil && len(data) > 100 {
			pages = append(pages, base64.StdEncoding.EncodeToString(data))
		}
	}
	log.Printf("[PdfConv] HWP direct export: %d pages", len(pages))
	return pages
}

// ─── Excel helpers ─────────────────────────────────────────────────────────

// convertExcelToPdfDirect uses ExportAsFixedFormat via PowerShell Excel COM.
func convertExcelToPdfDirect(inputPath, outputPath string) error {
	psCmd := `
param([string]$InputPath, [string]$OutputPath)
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($InputPath, 0, $true)
    $wb.ExportAsFixedFormat(0, $OutputPath)
    $wb.Close($false)
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psCmd, "-InputPath", inputPath, "-OutputPath", outputPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("Excel PDF 변환 실패: %v\n%s", err, string(out))
	}
	if info, err := os.Stat(outputPath); err != nil || info.Size() == 0 {
		return fmt.Errorf("출력 PDF가 생성되지 않았습니다")
	}
	return nil
}

// extractExcelPages exports each printed page of the workbook as a PNG image
// using Excel COM's ExportAsFixedFormat with XlFixedFormatType xlTypePNG (not available)
// → instead we export whole-sheet screenshots via CopyPicture + Chart.Export.
func extractExcelPages(inputPath, outDir string) []string {
	// Excel doesn't have a direct "save each page as PNG" COM API,
	// so we export the whole workbook as PDF then use Windows.Data.Pdf WinRT
	// — but since WinRT may be unreliable, we use a simpler approach:
	// Export each SHEET as an image using ActiveSheet.CopyPicture + Chart.Export.
	psCmd := `
param([string]$InputPath, [string]$OutDir)
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$results = @()
try {
    $wb = $excel.Workbooks.Open($InputPath, 0, $true)
    $sheetIdx = 0
    foreach ($ws in $wb.Worksheets) {
        $sheetIdx++
        $fileName = "sheet_{0:D4}.png" -f $sheetIdx
        $outPath = Join-Path $OutDir $fileName
        try {
            # Select used range
            $range = $ws.UsedRange
            if ($range -eq $null) { continue }
            $range.CopyPicture(1, 2) # xlScreen=1, xlBitmap=2
            # Paste into a temporary chart and export
            $chart = $wb.Charts.Add()
            $chart.Paste()
            $chart.Export($outPath, 'PNG')
            $chart.Delete()
            Write-Host "PAGE:$outPath"
        } catch {
            Write-Host "SKIP:sheet $sheetIdx error: $_"
        }
    }
    $wb.Close($false)
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psCmd, "-InputPath", inputPath, "-OutDir", outDir)
	out, err := cmd.CombinedOutput()
	output := string(out)
	log.Printf("[PdfConv] Excel page export:\n%s", output)

	if err != nil {
		log.Printf("[PdfConv] Excel page export error: %v", err)
		return nil
	}

	// Collect from explicit PAGE: lines first
	var pages []string
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "PAGE:") {
			imgPath := strings.TrimSpace(strings.TrimPrefix(line, "PAGE:"))
			data, err := os.ReadFile(imgPath)
			if err == nil && len(data) > 100 {
				pages = append(pages, base64.StdEncoding.EncodeToString(data))
			}
		}
	}

	// Fallback: glob
	if len(pages) == 0 {
		matches, _ := filepath.Glob(filepath.Join(outDir, "sheet_*.png"))
		sort.Strings(matches)
		for _, m := range matches {
			data, err := os.ReadFile(m)
			if err == nil && len(data) > 100 {
				pages = append(pages, base64.StdEncoding.EncodeToString(data))
			}
		}
	}
	return pages
}
