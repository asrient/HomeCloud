package routes

import (
	"homecloud/app/global"

	"github.com/twharmon/goweb"
)

func Sd(parentRouter *global.GoWebServer) {
	grp := global.NewRouteGroup(parentRouter, "/sd")

	grp.GET("/", func(c *goweb.Context) goweb.Responder {
		return c.JSON(200, map[string]interface{}{
			"meow": "ok",
			"woof": 123,
		})
	})

}
