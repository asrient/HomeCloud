package app

import (
	"fmt"
	"time"

	"homecloud/app/global"
	"homecloud/app/middlewares"
	"homecloud/app/routes"

	"github.com/gofiber/fiber/v2"
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

func (c *EmbeddedServer) serveApis() {
	api := c.server.Group("/api")
	//Add all routes here:
	routes.Sd(api)
}

func (c *EmbeddedServer) serveWeb() {
	if global.AppCtx.WebDir == "" {
		fmt.Println("[Start] webDir not set, not exposing web interface")
		return
	}
	c.server.Static("/", global.AppCtx.WebDir)
	// https://github.com/gofiber/fiber/issues/249
	c.server.Get("*", func(fiberCtx *fiber.Ctx) error {
		return fiberCtx.SendFile(global.AppCtx.WebDir + "/index.html")
	})
}

func (c *EmbeddedServer) Start() bool {
	if c.server != nil {
		panic("[ERROR] Server instance already up")
	}
	c.server = fiber.New()

	middlewares.Logger(c.server)
	middlewares.Relay(c.server)
	middlewares.Cors(c.server)

	c.server.Get("/ping", func(c *fiber.Ctx) error {
		return c.SendString("pong")
	})

	c.serveApis()
	c.serveWeb()

	fmt.Println("Server starting on port " + fmt.Sprint(global.AppCtx.ServerPort))
	c.server.Hooks().OnListen(c.serverListening)
	go c.server.Listen(":" + fmt.Sprint(global.AppCtx.ServerPort))
	return true
}

func (c *EmbeddedServer) Stop() bool {
	if c.server != nil {
		c.server.ShutdownWithTimeout(time.Duration(5 * time.Second))
		c.server = nil
		c.IsReady = false
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
