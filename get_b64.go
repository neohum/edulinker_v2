package main

import (
	"encoding/base64"
	"fmt"
	"unicode/utf16"
)

func encodePS(script string) string {
	runes := []rune(script)
	utf16Units := utf16.Encode(runes)
	b := make([]byte, len(utf16Units)*2)
	for i, u := range utf16Units {
		b[i*2] = byte(u)
		b[i*2+1] = byte(u >> 8)
	}
	return base64.StdEncoding.EncodeToString(b)
}

func main() {
	ps1 := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
	$res = @();
	try {
		$monitorsId = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue;
		$monitorsParams = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue;

		if ($monitorsId -isnot [array]) { $monitorsId = @($monitorsId) }
		if ($monitorsParams -isnot [array]) { $monitorsParams = @($monitorsParams) }

		foreach ($m in $monitorsId) {
			$name = "";
			if ($m.UserFriendlyName -ne $null) {
				$nameStr = ($m.UserFriendlyName | Where-Object {$_ -ne 0} | ForEach-Object {[char]$_}) -join '';
				$name = $nameStr.Trim();
			}
			if ($name -eq "") { $name = "일반 모니터" }

			$inches = 0;
			foreach ($p in $monitorsParams) {
				if ($p.InstanceName -eq $m.InstanceName) {
					if ($p.MaxHorizontalImageSize -gt 0) {
						$diagCm = [Math]::Sqrt([Math]::Pow($p.MaxHorizontalImageSize, 2) + [Math]::Pow($p.MaxVerticalImageSize, 2));
						$inches = [Math]::Round($diagCm / 2.54, 0);
					}
					break;
				}
			}

			if ($inches -gt 0) {
				$res += "$name ($($inches)인치)";
			} else {
				$res += $name;
			}
		}
	} catch {}

	if ($res.Count -gt 0) {
		$res;
	} else {
		Get-CimInstance Win32_DesktopMonitor | Select-Object -ExpandProperty Name;
	}`

	ps2 := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; 
	Get-CimInstance Win32_Printer | 
	Where-Object { $_.Network -or $_.Local } | 
	Where-Object { $_.Name -notmatch 'PDF|OneNote|XPS|Fax|Send To|Microsoft|Root|Software' -and $_.DriverName -notmatch 'PDF|OneNote|XPS|Fax|Send To|Microsoft|Root|Software' } | 
	ForEach-Object {
		$name = $_.Name
		$driver = $_.DriverName
		if ([string]::IsNullOrEmpty($driver) -or $name -eq $driver) {
			$name
		} else {
			$driver
		}
	} | Select-Object -Unique`

	fmt.Println("SCRIPT1:")
	fmt.Println(encodePS(ps1))
	fmt.Println("SCRIPT2:")
	fmt.Println(encodePS(ps2))
}
