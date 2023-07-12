package routes

import (
	"github.com/gofiber/fiber/v2"
)

type JsonResponse func(status int, data fiber.Map) error

type RouteType func(c *fiber.Ctx, respondJson JsonResponse) error

type RouteGroup struct {
	groupName   string
	fiberRouter fiber.Router
}

func CreateRouteGroup(groupName string, parentRouter fiber.Router) *RouteGroup {
	return &RouteGroup{groupName: groupName, fiberRouter: parentRouter.Group("/" + groupName)}
}

func (c *RouteGroup) GetGroupName() string {
	return c.groupName
}

func (c *RouteGroup) GetRouter() fiber.Router {
	return c.fiberRouter
}

func (c *RouteGroup) Handle(method string, path string, route RouteType, authRequired bool) {
	c.fiberRouter.Add(method, path, func(fiberCtx *fiber.Ctx) error {
		if authRequired {
			if !fiberCtx.Locals("isAuthenticated").(bool) {
				return fiberCtx.Status(401).SendString("Unauthorized")
			}
		}
		return route(fiberCtx, func(status int, data fiber.Map) error {
			return fiberCtx.Status(status).JSON(data)
		})
	})
}

func (c *RouteGroup) Get(path string, route RouteType, authRequired bool) {
	c.Handle("GET", path, route, authRequired)
}

func (c *RouteGroup) Post(path string, route RouteType, authRequired bool) {
	c.Handle("POST", path, route, authRequired)
}

func (c *RouteGroup) Put(path string, route RouteType, authRequired bool) {
	c.Handle("PUT", path, route, authRequired)
}

func (c *RouteGroup) Delete(path string, route RouteType, authRequired bool) {
	c.Handle("DELETE", path, route, authRequired)
}

func (c *RouteGroup) Patch(path string, route RouteType, authRequired bool) {
	c.Handle("PATCH", path, route, authRequired)
}

func (c *RouteGroup) Options(path string, route RouteType, authRequired bool) {
	c.Handle("OPTIONS", path, route, authRequired)
}

func (c *RouteGroup) Head(path string, route RouteType, authRequired bool) {
	c.Handle("HEAD", path, route, authRequired)
}

func (c *RouteGroup) All(path string, route RouteType, authRequired bool) {
	c.Handle("*", path, route, authRequired)
}
