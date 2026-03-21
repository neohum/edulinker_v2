package main

import (
	"encoding/base64"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/go-ole/go-ole"
	"github.com/go-ole/go-ole/oleutil"
)

// HwpConvertResult is returned from HWP conversion.
type HwpConvertResult struct {
	Success  bool   `json:"success"`
	FileName string `json:"file_name"`
	Data     string `json:"data"` // base64 encoded
	Size     int64  `json:"size"`
	Error    string `json:"error,omitempty"`
}

func (a *App) startHwpWorker() {
	log.Println("[HWP-Worker] Starting dedicated HWP worker thread...")
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	ole.CoInitializeEx(0, ole.COINIT_APARTMENTTHREADED)
	defer ole.CoUninitialize()
	for task := range a.hwpTaskChan {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[HWP-Worker] Recovered from panic: %v", r)
					task.respChan <- fmt.Errorf("HWP worker panic: %v", r)
				}
			}()
			err := a.executeHwpTask(task.inputPath, task.outputPath, task.outputType)
			task.respChan <- err
		}()
	}
}

func (a *App) ensureHwpObject() error {
	if a.hwpObject != nil {
		// Quick health check
		if _, err := oleutil.GetProperty(a.hwpObject, "Version"); err == nil {
			return nil
		}
		log.Println("[HWP-Worker] COM object stale, recreating...")
		a.hwpObject.Release()
		a.hwpObject = nil
	}

	progIDs := []string{"HWPFrame.HwpObject", "Hwp.HwpObject"}
	for _, progID := range progIDs {
		unknown, _ := oleutil.CreateObject(progID)
		if unknown == nil { continue }
		hwp, _ := unknown.QueryInterface(ole.IID_IDispatch)
		unknown.Release()
		if hwp == nil { continue }
		a.hwpObject = hwp
		oleutil.CallMethod(hwp, "RegisterModule", "FilePathCheckDLL", "FilePathCheckerModule")
		oleutil.CallMethod(hwp, "SetMessageBoxMode", 0)
		oleutil.PutProperty(hwp, "Visible", false)
		log.Println("[HWP-Worker] COM object created via", progID)
		return nil
	}
	return fmt.Errorf("한컴워드 COM 객체 생성 실패")
}

func (a *App) executeHwpTask(inputPath, outputPath, outputType string) error {
	start := time.Now()

	if err := a.ensureHwpObject(); err != nil {
		return err
	}
	hwp := a.hwpObject

	// Copy to a clean temp path (avoids OLE failures with special chars/spaces)
	tmpDir, _ := os.MkdirTemp("", "hwpwork_")
	defer os.RemoveAll(tmpDir)

	ext := strings.ToLower(filepath.Ext(inputPath))
	cleanExt := ".hwp"
	format := "HWP"
	if ext == ".hwpx" { cleanExt = ".hwpx"; format = "HWPX" }

	cleanInputPath := filepath.Join(tmpDir, "work"+cleanExt)
	data, err := os.ReadFile(inputPath)
	if err != nil { return fmt.Errorf("원본 파일 읽기 실패 (%s)", inputPath) }
	os.WriteFile(cleanInputPath, data, 0644)

	absOutputPath, _ := filepath.Abs(outputPath)
	log.Printf("[HWP-Worker] Opening: %s", cleanInputPath)

	// Open document - direct method first (faster)
	openSuccess := false
	res, _ := oleutil.CallMethod(hwp, "Open", cleanInputPath, format, "forceopen:true")
	if isVariantTrue(res) {
		openSuccess = true
	} else {
		// Fallback: Action-based open
		hAction := comGetProp(hwp, "HAction")
		hParamSet := comGetProp(hwp, "HParameterSet")
		if hAction != nil && hParamSet != nil {
			hfos := comGetProp(hParamSet, "HFileOpenSave")
			hSet := comGetProp(hfos, "HSet")
			if hfos != nil && hSet != nil {
				oleutil.CallMethod(hAction, "GetDefault", "FileOpen", hSet)
				oleutil.PutProperty(hfos, "filename", cleanInputPath)
				oleutil.PutProperty(hfos, "format", format)
				res, _ = oleutil.CallMethod(hAction, "Execute", "FileOpen", hSet)
				if isVariantTrue(res) { openSuccess = true }
				hSet.Release(); hfos.Release()
			}
			hParamSet.Release(); hAction.Release()
		}
	}
	if !openSuccess { return fmt.Errorf("HWP 파일 열기 실패") }
	log.Printf("[HWP-Worker] Opened in %v", time.Since(start))

	// Save as PDF/Image
	saveSuccess := false
	var fmts []string
	if outputType == "image" { fmts = []string{"PNG", "BMP", "JPG"} } else { fmts = []string{"PDF"} }

	hAction := comGetProp(hwp, "HAction")
	hParamSet := comGetProp(hwp, "HParameterSet")
	if hAction != nil && hParamSet != nil {
		hfos := comGetProp(hParamSet, "HFileOpenSave")
		hSet := comGetProp(hfos, "HSet")
		if hfos != nil && hSet != nil {
			for _, f := range fmts {
				oleutil.CallMethod(hAction, "GetDefault", "FileSaveAs_S", hSet)
				oleutil.PutProperty(hfos, "filename", absOutputPath)
				oleutil.PutProperty(hfos, "Format", f)
				res, _ = oleutil.CallMethod(hAction, "Execute", "FileSaveAs_S", hSet)
				if isVariantTrue(res) {
					outDir := filepath.Dir(absOutputPath)
					outExt := filepath.Ext(absOutputPath)
					outBase := strings.TrimSuffix(filepath.Base(absOutputPath), outExt)

					// Wait for output files to appear
					for k := 0; k < 30; k++ {
						// Check exact path (PDF case)
						if info, err := os.Stat(absOutputPath); err == nil && info.Size() > 0 {
							saveSuccess = true; break
						}
						// Check numbered files (image case: out001.png, out002.png, ...)
						matches, _ := filepath.Glob(filepath.Join(outDir, outBase+"*"+outExt))
						if len(matches) > 0 {
							lastFile := matches[len(matches)-1]
							if info, err := os.Stat(lastFile); err == nil && info.Size() > 0 {
								saveSuccess = true; break
							}
						}
						time.Sleep(100 * time.Millisecond)
					}

					// For images: stitch all page files into one tall image
					if saveSuccess && outputType == "image" {
						matches, _ := filepath.Glob(filepath.Join(outDir, outBase+"*"+outExt))
						sort.Strings(matches)
						log.Printf("[HWP-Worker] Found %d page image(s)", len(matches))

						if len(matches) == 1 {
							// Single page — just rename
							if matches[0] != absOutputPath {
								os.Rename(matches[0], absOutputPath)
							}
						} else if len(matches) > 1 {
							// Multiple pages — stitch vertically
							if err := stitchImages(matches, absOutputPath); err != nil {
								log.Printf("[HWP-Worker] Stitch error: %v, using first page", err)
								os.Rename(matches[0], absOutputPath)
							}
						}
					}
				}
				if saveSuccess { break }
			}
			hSet.Release(); hfos.Release()
		}
		hParamSet.Release(); hAction.Release()
	}

	oleutil.CallMethod(hwp, "Clear", 1)
	log.Printf("[HWP-Worker] Total convert time: %v (success=%v)", time.Since(start), saveSuccess)
	if !saveSuccess { return fmt.Errorf("%s 저장 실패", outputType) }
	return nil
}

func (a *App) QuitHwp() {
	if a.hwpObject != nil {
		oleutil.CallMethod(a.hwpObject, "Quit")
		a.hwpObject.Release()
		a.hwpObject = nil
	}
	exec.Command("taskkill", "/F", "/IM", "Hwp.exe", "/T").Run()
}

func (a *App) ConvertHwp(inputName string, inputBase64 string, outputType string) HwpConvertResult {
	hwpData, _ := base64.StdEncoding.DecodeString(inputBase64)
	tmpDir, _ := os.MkdirTemp("", "hwp_")
	defer os.RemoveAll(tmpDir)
	inputPath := filepath.Join(tmpDir, inputName)
	os.WriteFile(inputPath, hwpData, 0644)
	
	ext := ".pdf"
	if outputType == "image" { ext = ".png" }
	outputPath := filepath.Join(tmpDir, "out"+ext)

	respChan := make(chan error, 1)
	a.hwpTaskChan <- hwpTask{inputPath, outputPath, outputType, respChan}

	select {
	case err := <-respChan:
		if err != nil { return HwpConvertResult{Error: err.Error()} }
	case <-time.After(60 * time.Second):
		return HwpConvertResult{Error: "변환 시간 초과"}
	}

	outData, err := os.ReadFile(outputPath)
	if err != nil {
		log.Printf("[HWP-Worker] Failed to read output file %s: %v", outputPath, err)
		return HwpConvertResult{Error: "변환된 파일 읽기 실패: " + err.Error()}
	}
	log.Printf("[HWP-Worker] Output file size: %d bytes", len(outData))
	return HwpConvertResult{Success: true, FileName: inputName + ext, Data: base64.StdEncoding.EncodeToString(outData), Size: int64(len(outData))}
}

func comGetProp(obj *ole.IDispatch, name string) *ole.IDispatch {
	v, err := oleutil.GetProperty(obj, name)
	if err != nil { return nil }
	return v.ToIDispatch()
}

func isVariantTrue(v *ole.VARIANT) bool {
	if v == nil { return false }
	val := v.Value()
	switch t := val.(type) {
	case bool: return t
	case int64: return t != 0
	case int32: return t != 0
	case int: return t != 0
	}
	return false
}

// stitchImages combines multiple page images vertically into a single tall PNG.
func stitchImages(paths []string, outputPath string) error {
	var images []image.Image
	totalHeight := 0
	maxWidth := 0

	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil { return err }
		img, _, err := image.Decode(f)
		f.Close()
		if err != nil { return err }
		bounds := img.Bounds()
		totalHeight += bounds.Dy()
		if bounds.Dx() > maxWidth { maxWidth = bounds.Dx() }
		images = append(images, img)
	}

	canvas := image.NewRGBA(image.Rect(0, 0, maxWidth, totalHeight))
	y := 0
	for _, img := range images {
		bounds := img.Bounds()
		draw.Draw(canvas, image.Rect(0, y, bounds.Dx(), y+bounds.Dy()), img, bounds.Min, draw.Src)
		y += bounds.Dy()
	}

	out, err := os.Create(outputPath)
	if err != nil { return err }
	defer out.Close()
	return png.Encode(out, canvas)
}

func (a *App) CheckHancom() map[string]interface{} {
	result := map[string]interface{}{"installed": false, "version": "", "path": ""}
	
	// 1. Comprehensive path search (both 64-bit and 32-bit paths)
	programFiles := os.Getenv("ProgramFiles")
	programFilesX86 := os.Getenv("ProgramFiles(x86)")
	
	searchDirs := []struct{ base, sub, ver string }{
		{programFiles, "HNC/Hwp 2024", "2024"},
		{programFiles, "HNC/Office 2024", "2024"},
		{programFiles, "HNC/Hwp 2022", "2022"},
		{programFiles, "HNC/Office 2022", "2022"},
		{programFiles, "HNC/Hwp 2020", "2020"},
		{programFilesX86, "HNC/Hwp 2024", "2024"},
		{programFilesX86, "HNC/Hwp 2022", "2022"},
		{programFilesX86, "HNC/Hwp 2020", "2020"},
	}

	for _, sd := range searchDirs {
		target := filepath.Join(sd.base, sd.sub)
		if info, err := os.Stat(target); err == nil && info.IsDir() {
			result["installed"] = true
			result["version"] = sd.ver
			result["path"] = target
			return result
		}
	}

	// 2. COM Object Registry Check (If path search fails)
	// This covers cases where it's installed in a custom path but registered in Windows.
	ole.CoInitializeEx(0, ole.COINIT_APARTMENTTHREADED)
	// Try creating the object briefly
	for _, progID := range []string{"HWPFrame.HwpObject", "Hwp.HwpObject", "HWPFrame.HwpObject.1"} {
		unknown, err := oleutil.CreateObject(progID)
		if err == nil && unknown != nil {
			unknown.Release()
			result["installed"] = true
			result["version"] = "COM 등록됨"
			result["path"] = "Registry"
			return result
		}
	}

	return result
}
