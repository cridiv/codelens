package main

import (
	"log"
	"os/exec"
	"runtime"
)

// openBrowser launches the default browser at url.
// Failures are non-fatal — the user can always open the URL manually.
func openBrowser(url string) {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "linux":
		cmd = "xdg-open"
		args = []string{url}
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start", url}
	default:
		log.Printf("[browser] unsupported OS %q — open %s manually", runtime.GOOS, url)
		return
	}

	if err := exec.Command(cmd, args...).Start(); err != nil {
		log.Printf("[browser] could not open browser: %v — open %s manually", err, url)
	}
}
