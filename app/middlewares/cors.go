package middlewares

import (
	"github.com/twharmon/goweb"
)

func Cors(c *goweb.Context) goweb.Responder {
	c.ResponseWriter.Header().Set("Access-Control-Allow-Origin", "*")
	c.ResponseWriter.Header().Set("Access-Control-Allow-Headers", "Origin,Content-Type,Accept,Content-Length,Accept-Language,Accept-Encoding,Connection,Access-Control-Allow-Origin")
	c.ResponseWriter.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
	return nil
}
