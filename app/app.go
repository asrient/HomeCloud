package app

import (
	"fmt"
	"homecloud/app/global"
	"homecloud/app/shared"
)

type HomeCloudApp struct {
	Started       bool
	server        *EmbeddedServer
	onServerStart *func()
}

func NewHomeCloudApp(nativeDevicePhotos shared.DevicePhotosManager) *HomeCloudApp {
	global.InitializeAppContext()
	if nativeDevicePhotos == nil {
		fmt.Println("Native Photos is not used")
	} else {
		global.InitializeDevicePhotos(nativeDevicePhotos)
	}
	return &HomeCloudApp{Started: false}
}

func (c *HomeCloudApp) Start() {
	if c.Started {
		fmt.Println("[ERROR] HomeCloudApp instance already up")
		return
	}
	c.Started = true
	c.server.OnReady(c.onServerStart)
	global.InitializeDb()
	global.MigrateDb()
	c.server.Start()

	// test
	if global.DevicePhotos.IsInitilized {
		global.DevicePhotos.PhotosTest()
	}
	global.DbTrial()
}

func (c *HomeCloudApp) OnServerStart(cb *func()) {
	c.onServerStart = cb
}
