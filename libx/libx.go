// Copyright 2015 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Package hello is a trivial package for gomobile bind example.
package libx

import (
	"fmt"

	"homecloud/app"
	"homecloud/app/shared"
)

type NativeCalls interface {
	OnWebEvent(Event string, DataStr string) string
}

type MobileApp struct {
	NativeCalls
	hcApp *app.HomeCloudApp
}

func (c *MobileApp) OnWebEvent(Event string, DataStr string) string {
	fmt.Println("[ReceiveEvent]", Event, DataStr)
	return "received event"
}

func (c *MobileApp) onReady() {
	fmt.Println("[onReady] cb result", c.NativeCalls.OnWebEvent("server", "started"))
}

func (c *MobileApp) Start() {
	fmt.Println("[Start] Starting app...")
	f := func() {
		c.onReady()
	}
	c.hcApp.OnServerStart(&f)
	go c.hcApp.Start()
}

type MobileAppConfig struct {
	WebDir   string
	Platform string
	DataDir  string
	Photos   shared.DevicePhotosManager
}

func NewMobileApp(mobileConfig *MobileAppConfig, Nc NativeCalls) *MobileApp {
	ctx := shared.NewAppContext()
	ctx.WebDir = mobileConfig.WebDir
	ctx.Platform = mobileConfig.Platform
	ctx.DataDir = mobileConfig.DataDir
	if mobileConfig.Photos == nil {
		fmt.Println("Native Photos is not used")
	} else {
		ctx.Photos = shared.NewPhotosWrapper(mobileConfig.Photos)
		//photosManager.Trial()
	}

	fmt.Println("[NewMobileApp] WebDir", ctx.WebDir)
	fmt.Println("[NewMobileApp] DataDir", ctx.DataDir)
	co := app.NewHomeCloudApp(ctx)
	return &MobileApp{hcApp: co, NativeCalls: Nc}
}
