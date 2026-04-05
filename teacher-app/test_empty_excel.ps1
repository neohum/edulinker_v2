try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
    
  Write-Host "Adding workbook..."
  $wb = $excel.Workbooks.Add()
    
  $outPath = "C:\Users\nm\AppData\Local\Temp\empty_test.pdf"
  if (Test-Path $outPath) { Remove-Item $outPath }
    
  Write-Host "Exporting..."
  $wb.ExportAsFixedFormat(0, $outPath)
  Write-Host "Export done."
    
  if (Test-Path $outPath) {
    Write-Host "File created, size: $((Get-Item $outPath).Length)"
  }
  else {
    Write-Host "File NOT created!"
  }
    
  $wb.Close($false)
  $excel.Quit()
}
catch {
  Write-Host "Error: $($_.Exception.Message)"
}
