package main

import (
	"fmt"
	"os/exec"
)

func main() {
	psCmd := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
	$x = 5;
	# This is a comment
	Write-Host $x;`
	out, err := exec.Command("powershell", "-NoProfile", "-Command", psCmd).CombinedOutput()
	fmt.Printf("Out: %s\nErr: %v\n", out, err)
}
