package global

import (
	"github.com/twharmon/goweb"
)

type RouteGroup struct {
	engine     *goweb.Engine
	middleware *goweb.Middleware
	basePath   string
}

func (c *RouteGroup) GetEngine() *goweb.Engine {
	return c.engine
}

func (c *RouteGroup) GetMiddleware() *goweb.Middleware {
	return c.middleware
}

func (c *RouteGroup) AddMiddleware(middleware goweb.Handler) {
	c.middleware = c.middleware.Middleware(middleware)
}

func (c *RouteGroup) GET(path string, handler goweb.Handler) {
	c.middleware.GET(c.basePath+path, handler)
}

func (c *RouteGroup) POST(path string, handler goweb.Handler) {
	c.middleware.POST(c.basePath+path, handler)
}

func (c *RouteGroup) PUT(path string, handler goweb.Handler) {
	c.middleware.PUT(c.basePath+path, handler)
}

func (c *RouteGroup) DELETE(path string, handler goweb.Handler) {
	c.middleware.DELETE(c.basePath+path, handler)
}

func (c *RouteGroup) HEAD(path string, handler goweb.Handler) {
	c.middleware.HEAD(c.basePath+path, handler)
}

func (c *RouteGroup) PATCH(path string, handler goweb.Handler) {
	c.middleware.PATCH(c.basePath+path, handler)
}

func NewRouteGroup() *RouteGroup {
	engine := goweb.New()
	return &RouteGroup{engine: engine, middleware: engine.Middleware(), basePath: ""}
}

func NewSubRouteGroup(parent *RouteGroup, pathId string) *RouteGroup {
	return &RouteGroup{engine: parent.engine, middleware: parent.middleware, basePath: parent.basePath + pathId}
}
