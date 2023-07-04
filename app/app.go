package app

import (
	"fmt"

	"homecloud/kits/dbKit"
)

type AppConfig struct {
	WebDir     string
	Platform   string
	ServerPort int
	DataDir    string
}

func NewAppConfig() *AppConfig {
	return &AppConfig{
		WebDir:     "",
		Platform:   "cli",
		ServerPort: 6457,
		DataDir:    "./data",
	}
}

type HomeCloudApp struct {
	Started       bool
	config        *AppConfig
	db            *dbKit.DBService
	server        *EmbeddedServer
	onServerStart *func()
}

func NewHomeCloudApp(config *AppConfig) *HomeCloudApp {
	return &HomeCloudApp{config: config, db: nil, server: nil, Started: false}
}

func (c *HomeCloudApp) Start() {
	if c.Started {
		fmt.Println("[ERROR] HomeCloudApp instance already up")
		return
	}
	c.server = NewEmbeddedServer()
	c.server.OnReady(c.onServerStart)
	c.db = dbKit.NewDBService(c.config.DataDir + "/homecloud.db")
	c.server.Start(c.config.WebDir, c.config.ServerPort)
	// test
	c.db.Trial()
	c.Started = true
}

func (c *HomeCloudApp) OnServerStart(cb *func()) {
	c.onServerStart = cb
}
