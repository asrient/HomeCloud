package app

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

type EmbeddedServer struct {
	IsReady bool
	server  *fiber.App
	onReady *func()
}

func (c *EmbeddedServer) serverListening() error {
	c.IsReady = true
	if c.onReady != nil {
		(*c.onReady)()
	}
	return nil
}

func (c *EmbeddedServer) Start(webDir string, port int) bool {
	if c.server != nil {
		fmt.Println("[ERROR] Server instance already up")
		return false
	}

	fmt.Println("[Start] Starting server...")
	c.server = fiber.New()

	c.server.Use(logger.New(logger.Config{
		Format: "[${ip}]:${port} ${status} - ${method} ${path}\n",
	}))
	c.server.Get("/api", func(c *fiber.Ctx) error {
		return c.SendString("Hello, World!")
	})

	if webDir == "" {
		fmt.Println("[Start] webDir not set, not exposing web interface")
	} else {
		c.server.Static("/", webDir)
		// https://github.com/gofiber/fiber/issues/249
		c.server.Get("*", func(c *fiber.Ctx) error {
			return c.SendFile(webDir + "/index.html")
		})
	}

	fmt.Println("[Start] Server started on port " + fmt.Sprint(port))
	c.server.Hooks().OnListen(c.serverListening)
	go c.server.Listen(":" + fmt.Sprint(port))
	fmt.Println("Total routes found: ", c.server.HandlersCount())
	return true
}

func (c *EmbeddedServer) Stop() bool {
	if c.server != nil {
		c.server.ShutdownWithTimeout(time.Duration(5 * time.Second))
		c.server = nil
		return true
	}
	return false
}

func (c *EmbeddedServer) OnReady(cb *func()) {
	c.onReady = cb
}

func NewEmbeddedServer() *EmbeddedServer {
	return &EmbeddedServer{server: nil, IsReady: false, onReady: nil}
}
