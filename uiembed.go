// Package uiembed exposes the embedded Vite/React UI build.
// This file must live at the repo root (next to the ui/ directory) because
// go:embed paths are relative to the source file's directory and cannot
// traverse upward with "..".
package uiembed

import "embed"

// FS holds the pre-built UI assets from ui/dist.
// Run `cd ui && npm run build` (or `make ui`) before `go build`.
//
//go:embed ui/dist
var FS embed.FS
