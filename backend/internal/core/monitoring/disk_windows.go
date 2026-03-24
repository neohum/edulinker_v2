//go:build windows

package monitoring

import (
	"syscall"
	"unsafe"
)

func diskUsage() (free, total uint64, err error) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("GetDiskFreeSpaceExW")

	root, err := syscall.UTF16PtrFromString("C:\\")
	if err != nil {
		return 0, 0, err
	}

	var freeBytesAvailable, totalBytes, totalFreeBytes uint64
	ret, _, callErr := proc.Call(
		uintptr(unsafe.Pointer(root)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	if ret == 0 {
		return 0, 0, callErr
	}

	return freeBytesAvailable, totalBytes, nil
}
