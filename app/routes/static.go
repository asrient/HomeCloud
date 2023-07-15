package routes

import (
	"homecloud/app/global"
	"homecloud/app/helpers"

	"github.com/twharmon/goweb"
)

func Static(c *goweb.Context) goweb.Responder {
	path := c.Param("path")
	if path == "" {
		path = "index.html"
	}
	return helpers.NewFileResponse(c, global.AppCtx.WebDir+"/"+path, global.AppCtx.WebDir+"/index.html")
}
