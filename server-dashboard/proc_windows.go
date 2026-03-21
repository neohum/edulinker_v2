package main

import (
	"os/exec"
	"syscall"
)

// hiddenProcAttr sets Windows-specific process attributes to hide the console window.
func hiddenProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		HideWindow:    true,
	}
}
