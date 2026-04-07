package main

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// OfficeConvertResult is returned from Office conversion.
type OfficeConvertResult struct {
	Success  bool   `json:"success"`
	FileName string `json:"file_name"`
	Data     string `json:"data"` // base64 encoded
	Size     int64  `json:"size"`
	Error    string `json:"error,omitempty"`
}

// ConvertExcelToPdf converts an XLSX file to PDF using Excel COM via PowerShell.
func (a *App) ConvertExcelToPdf(inputName string, inputBase64 string) OfficeConvertResult {
	log.Printf("[App] Excel to PDF request: %s", inputName)
	return a.convertOfficeDoc(inputName, inputBase64, "excel")
}

// ConvertPptToPdf converts a PPTX file to PDF using PowerPoint COM via PowerShell.
func (a *App) ConvertPptToPdf(inputName string, inputBase64 string) OfficeConvertResult {
	log.Printf("[App] PPT to PDF request: %s", inputName)
	return a.convertOfficeDoc(inputName, inputBase64, "powerpoint")
}

func (a *App) convertOfficeDoc(inputName string, inputBase64 string, appType string) OfficeConvertResult {
	data, err := base64.StdEncoding.DecodeString(inputBase64)
	if err != nil {
		return OfficeConvertResult{Error: "데이터 디코딩 실패"}
	}

	tmpDir, err := os.MkdirTemp("", "officeconv_")
	if err != nil {
		return OfficeConvertResult{Error: "임시 폴더 생성 실패"}
	}
	defer os.RemoveAll(tmpDir)

	inputPath := filepath.Join(tmpDir, inputName)
	if err := os.WriteFile(inputPath, data, 0644); err != nil {
		return OfficeConvertResult{Error: "임시 파일 생성 실패"}
	}

	baseName := strings.TrimSuffix(inputName, filepath.Ext(inputName))
	outputPath := filepath.Join(tmpDir, baseName+".pdf")

	var psCmd string
	if appType == "excel" {
		psCmd = `
			param([string]$inPath, [string]$outPath)
			$ErrorActionPreference = "Stop"
			[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
			$excel = New-Object -ComObject Excel.Application
			$excel.Visible = $false
			$excel.DisplayAlerts = $false
			try {
				$wb = $excel.Workbooks.Open($inPath)
				$wb.ExportAsFixedFormat(0, $outPath)
				$wb.Close($false)
			} catch {
				Write-Error $_.Exception.Message
				exit 1
			} finally {
				if ($excel) {
					$excel.Quit()
					[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
				}
			}
		`
	} else {
		psCmd = `
			param([string]$inPath, [string]$outPath)
			$ErrorActionPreference = "Stop"
			[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
			$ppt = New-Object -ComObject PowerPoint.Application
			try {
				$pres = $ppt.Presentations.Open($inPath, $true, $false, $false)
				$pres.SaveAs($outPath, 32) # ppSaveAsPDF = 32
				$pres.Close()
			} catch {
				Write-Error $_.Exception.Message
				exit 1
			} finally {
				if ($ppt) {
					$ppt.Quit()
					[System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
				}
			}
		`
	}

	psScriptPath := filepath.Join(tmpDir, "convert.ps1")
	bom := []byte{0xEF, 0xBB, 0xBF}
	os.WriteFile(psScriptPath, append(bom, []byte(psCmd)...), 0644)

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", psScriptPath, "-inPath", inputPath, "-outPath", outputPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[App] Office conversion error: %v\nOutput: %s", err, string(out))
		return OfficeConvertResult{Error: fmt.Sprintf("변환 중 오류가 발생했습니다. (MS Office 확인 필요: %s)", strings.TrimSpace(string(out)))}
	}

	// Read result
	outData, err := os.ReadFile(outputPath)
	if err != nil {
		return OfficeConvertResult{Error: "변환 결과 파일 읽기 실패"}
	}

	return OfficeConvertResult{
		Success:  true,
		FileName: baseName + ".pdf",
		Data:     base64.StdEncoding.EncodeToString(outData),
		Size:     int64(len(outData)),
	}
}

// CheckOfficeStatus checks if Excel and PowerPoint are available.
func (a *App) CheckOfficeStatus() map[string]bool {
	status := map[string]bool{
		"excel":      false,
		"powerpoint": false,
	}

	// Check Excel
	cmdExcel := exec.Command("powershell", "-NoProfile", "-Command", "New-Object -ComObject Excel.Application | Out-Null")
	if err := cmdExcel.Run(); err == nil {
		status["excel"] = true
	}

	// Check PowerPoint
	cmdPpt := exec.Command("powershell", "-NoProfile", "-Command", "New-Object -ComObject PowerPoint.Application | Out-Null")
	if err := cmdPpt.Run(); err == nil {
		status["powerpoint"] = true
	}

	return status
}
