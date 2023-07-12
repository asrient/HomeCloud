package routes

import (
	"github.com/gofiber/fiber/v2"
)

func Sd(parentRouter fiber.Router) {
	grp := CreateRouteGroup("sd", parentRouter)

	grp.Get("/", func(c *fiber.Ctx, respondJson JsonResponse) error {
		return respondJson(200, fiber.Map{"greet": "hello from sd!"})
	}, false)

}
