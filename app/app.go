package app

import (
	"fmt"

	"homecloud/app/kits/dbKit"
	"homecloud/app/shared"
)

type HomeCloudApp struct {
	Started       bool
	appCtx        *shared.AppContext
	server        *EmbeddedServer
	onServerStart *func()
}

func NewHomeCloudApp(appCtx *shared.AppContext) *HomeCloudApp {
	return &HomeCloudApp{appCtx: appCtx, server: nil, Started: false}
}

func (c *HomeCloudApp) Start() {
	if c.Started {
		fmt.Println("[ERROR] HomeCloudApp instance already up")
		return
	}
	c.server = NewEmbeddedServer()
	c.server.OnReady(c.onServerStart)
	c.appCtx.Db = dbKit.NewDBService(c.appCtx.DataDir + "/homecloud.db")
	c.server.Start(c.appCtx.WebDir, c.appCtx.ServerPort)
	// test
	if c.appCtx.Photos != nil {
		c.appCtx.Photos.PhotosTest()
	}
	c.appCtx.Db.Trial()
	c.Started = true
}

func (c *HomeCloudApp) OnServerStart(cb *func()) {
	c.onServerStart = cb
}
