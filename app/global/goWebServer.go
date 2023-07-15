package global

import (
	"github.com/twharmon/goweb"
)

type GoWebServer struct {
	engine     *goweb.Engine
	middleware *goweb.Middleware
	basePath   string
}

func (c *GoWebServer) GetEngine() *goweb.Engine {
	return c.engine
}

func (c *GoWebServer) GetMiddleware() *goweb.Middleware {
	return c.middleware
}

func (c *GoWebServer) AddMiddleware(middleware goweb.Handler) {
	c.middleware = c.middleware.Middleware(middleware)
}

func (c *GoWebServer) GET(path string, handler goweb.Handler) {
	c.middleware.GET(c.basePath+path, handler)
}

func (c *GoWebServer) POST(path string, handler goweb.Handler) {
	c.middleware.POST(c.basePath+path, handler)
}

func (c *GoWebServer) PUT(path string, handler goweb.Handler) {
	c.middleware.PUT(c.basePath+path, handler)
}

func (c *GoWebServer) DELETE(path string, handler goweb.Handler) {
	c.middleware.DELETE(c.basePath+path, handler)
}

func (c *GoWebServer) HEAD(path string, handler goweb.Handler) {
	c.middleware.HEAD(c.basePath+path, handler)
}

func (c *GoWebServer) PATCH(path string, handler goweb.Handler) {
	c.middleware.PATCH(c.basePath+path, handler)
}

func NewGoWebServer() *GoWebServer {
	engine := goweb.New()
	return &GoWebServer{engine: engine, middleware: engine.Middleware(), basePath: ""}
}

func NewRouteGroup(parent *GoWebServer, pathId string) *GoWebServer {
	return &GoWebServer{engine: parent.engine, middleware: parent.middleware, basePath: parent.basePath + pathId}
}
