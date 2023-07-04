// Copyright 2015 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Package hello is a trivial package for gomobile bind example.
package libx

import (
	"fmt"

	"homecloud/app"
)

type NativeCallbacks interface {
	OnWebEvent(Event string, DataStr string) string
}

type MobileApp struct {
	NativeCallbacks
	hcApp *app.HomeCloudApp
}

func (c *MobileApp) OnWebEvent(Event string, DataStr string) string {
	fmt.Println("[ReceiveEvent]", Event, DataStr)
	return "received event"
}

func (c *MobileApp) onReady() {
	fmt.Println("[onReady] cb result", c.NativeCallbacks.OnWebEvent("server", "started"))
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
}

func NewMobileApp(mobileConfig *MobileAppConfig, Cb NativeCallbacks) *MobileApp {
	config := app.NewAppConfig()
	config.WebDir = mobileConfig.WebDir
	config.Platform = mobileConfig.Platform
	config.DataDir = mobileConfig.DataDir

	fmt.Println("[NewMobileApp] WebDir", config.WebDir)
	fmt.Println("[NewMobileApp] DataDir", config.DataDir)
	co := app.NewHomeCloudApp(config)
	return &MobileApp{hcApp: co, NativeCallbacks: Cb}
}
