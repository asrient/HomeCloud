// Copyright 2015 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Package hello is a trivial package for gomobile bind example.
package libx

import (
	"fmt"
	"homecloud/app"
	"homecloud/app/global"
	"homecloud/app/shared"
)

type NativeCalls interface {
	OnWebEvent(Event string, DataStr string) string
}

type MobileAppConfig struct {
	WebDir   string
	Platform string
	DataDir  string
	Photos   shared.DevicePhotosManager
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

func NewMobileApp(mobileConfig *MobileAppConfig, Nc NativeCalls) *MobileApp {
	co := app.NewHomeCloudApp(mobileConfig.Photos)
	global.AppCtx.WebDir = mobileConfig.WebDir
	global.AppCtx.Platform = mobileConfig.Platform
	global.AppCtx.DataDir = mobileConfig.DataDir

	fmt.Println("[NewMobileApp] WebDir", global.AppCtx.WebDir)
	fmt.Println("[NewMobileApp] DataDir", global.AppCtx.DataDir)
	return &MobileApp{NativeCalls: Nc, hcApp: co}
}
