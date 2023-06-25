// Copyright 2015 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Package hello is a trivial package for gomobile bind example.
package libx

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
)

func Greetings(name string) string {
	return fmt.Sprintf("Meoww, %s!", name)
}

type Counter struct {
	Value int
}

func (c *Counter) Inc()             { c.Value++ }
func (c *Counter) ToString() string { return fmt.Sprintf("%d", c.Value) }

func NewCounter() *Counter { return &Counter{5} }

type NativeCallbacks interface {
	OnEvent(Event string, DataStr string) string
}

type App struct {
	Ready      bool
	StaticPath string
	Cb         NativeCallbacks
}

type HttpResp struct {
	Status int
	Body   string
}

func (c *App) OnEvent(Event string, DataStr string) string {
	fmt.Println("[ReceiveEvent]", Event, DataStr)
	return "received event"
}

func (app *App) Start() bool {
	server := fiber.New()

	server.Get("/api", func(c *fiber.Ctx) error {
		return c.SendString("Hello, World!")
	})

	if app.StaticPath == "" {
		fmt.Println("[Start] StaticPath not set, using default ./public")
		app.StaticPath = "./public"
	} else {
		fmt.Println("[Start] StaticPath set to", app.StaticPath)
	}
	server.Static("/", app.StaticPath)

	// https://github.com/gofiber/fiber/issues/249
	server.Get("*", func(c *fiber.Ctx) error {
		return c.SendFile(app.StaticPath + "/index.html")
	})

	go server.Listen(":3000")
	app.Cb.OnEvent("server", "started")
	return true
}

func NewApp(StaticPath string, Cb NativeCallbacks) *App {
	fmt.Println("[NewApp] cb test", Cb.OnEvent("test", "test"))
	return &App{Ready: true, StaticPath: StaticPath, Cb: Cb}
}
