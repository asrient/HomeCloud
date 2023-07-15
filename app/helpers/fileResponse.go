package helpers

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/twharmon/goweb"
)

// Reference: https://github.com/twharmon/goweb/blob/main/examples/files/main.go

type FileResponse struct {
	context      *goweb.Context
	path         string
	fallbackPath string
}

func NewFileResponse(c *goweb.Context, path string, fallbackPath string) *FileResponse {
	return &FileResponse{
		context:      c,
		path:         strings.TrimRight(path, "/"),
		fallbackPath: strings.TrimRight(fallbackPath, "/"),
	}
}

func (r *FileResponse) Respond() {
	f, err := os.Open(r.path)
	if err != nil {
		r.context.LogError(fmt.Errorf("unable to open file: %w", err))
		http.ServeFile(r.context.ResponseWriter, r.context.Request, r.fallbackPath)
	}
	defer f.Close()
	http.ServeFile(r.context.ResponseWriter, r.context.Request, r.path)
}
