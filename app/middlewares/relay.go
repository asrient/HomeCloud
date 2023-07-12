package middlewares

import (
	"crypto/tls"
	"fmt"

	"homecloud/app/helpers/proxy"

	"github.com/gofiber/fiber/v2"
)

func Relay(server *fiber.App) {
	// if target https site uses a self-signed certificate, you should
	// call WithTlsConfig before Do and Forward
	proxy.WithTlsConfig(&tls.Config{
		InsecureSkipVerify: true,
	})
	server.All("/api/*", func(c *fiber.Ctx) error {
		if c.Query("node") == "" || c.Query("node") == "self" { // todo: check for self nodeId as well
			c.Next()
			return nil
		}
		// https://stackoverflow.com/questions/68615135/how-do-i-get-the-querystring-using-golangs-fiber
		url := "https://reqres.in" + c.Path() + "?" + string(c.Request().URI().QueryString())
		fmt.Println("relay to url:", url)
		if err := proxy.Do(c, url); err != nil {
			return err
		}
		// Remove Server header from response
		c.Response().Header.Del(fiber.HeaderServer)
		return nil
	})
}
