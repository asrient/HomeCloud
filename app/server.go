package app

import (
	"fmt"
	"log"
	"net"
	"net/http"

	"homecloud/app/global"
	"homecloud/app/middlewares"
	"homecloud/app/routes"

	"github.com/twharmon/goweb"
)

type EmbeddedServer struct {
	IsReady   bool
	server    *global.GoWebServer
	onReadyCb func()
}

func (c *EmbeddedServer) OnReady(cb func()) {
	c.onReadyCb = cb
}

func (c *EmbeddedServer) serverListening() error {
	c.IsReady = true
	if c.onReadyCb != nil {
		c.onReadyCb()
	}
	return nil
}

func (c *EmbeddedServer) serveApis() {
	api := global.NewRouteGroup(c.server, "/api")
	//Add all routes here:
	routes.Sd(api)
}

func (c *EmbeddedServer) serveWeb() {
	if global.AppCtx.WebDir == "" {
		fmt.Println("[Start] webDir not set, not exposing web interface")
		return
	}
	c.server.GET("/{path:.*}", func(webCtx *goweb.Context) goweb.Responder {
		return routes.Static(webCtx)
	})
}

func (c *EmbeddedServer) Start() bool {
	if c.server != nil {
		panic("[ERROR] Server instance already up")
	}
	c.server = global.NewGoWebServer()

	c.server.GetEngine().RegisterLogger(newLogger(goweb.LogLevelInfo))
	c.server.AddMiddleware(middlewares.Cors)

	c.server.GET("/ping", func(c *goweb.Context) goweb.Responder {
		return c.Text(200, "pong")
	})

	c.serveApis()
	c.serveWeb()

	fmt.Println("Server starting on port " + fmt.Sprint(global.AppCtx.ServerPort))
	httpServer := &http.Server{
		Addr:    ":http",
		Handler: c.server.GetEngine(),
	}
	l, err := net.Listen("tcp", ":"+fmt.Sprint(global.AppCtx.ServerPort))
	if err != nil {
		panic(err)
	}
	c.serverListening()
	go log.Fatal(httpServer.Serve(l))
	return true
}

func (c *EmbeddedServer) Stop() bool {
	if c.server != nil {
		c.server.GetEngine().Shutdown()
		c.server = nil
		c.IsReady = false
		return true
	}
	return false
}

func NewEmbeddedServer() *EmbeddedServer {
	return &EmbeddedServer{server: nil, IsReady: false, onReadyCb: nil}
}

type logger struct {
	level goweb.LogLevel
}

func newLogger(level goweb.LogLevel) goweb.Logger {
	return &logger{level: level}
}

func (l *logger) Log(c *goweb.Context, logLevel goweb.LogLevel, messages ...interface{}) {
	if l.level > logLevel {
		return
	}
	prefix := fmt.Sprintf("[%s] %s", logLevel, c.Request.URL.Path)
	messages = append([]interface{}{prefix}, messages...)
	log.Println(messages...)
}
