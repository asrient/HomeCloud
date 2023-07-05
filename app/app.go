package app

import (
	"fmt"

	"homecloud/kits/dbKit"
	"homecloud/shared"
)

type PhotosWrapper struct {
	shared.DevicePhotosManager
}

func (c *PhotosWrapper) OnPermissionChange(granted bool) {
	fmt.Println("[OnPermissionChange] granted", granted)
}

func (c *PhotosWrapper) RequestPermission() bool {
	return c.DevicePhotosManager.RequestPermission(c)
}

func (c *PhotosWrapper) PhotosTest() {
	fmt.Println("[photosTest] start")
	fmt.Println("[photosTest] is permission granted", c.IsPermissionGranted())
	fmt.Println("[photosTest] request permission", c.RequestPermission())
	fmt.Println("[photosTest] get photos", c.GetPhotos(":all", 0, 10))
	fmt.Println("[photosTest] get albums", c.GetAlbums())
	fmt.Println("[photosTest] get photo buffer", c.GetPhotoBuffer("1"))

}

func NewPhotosWrapper(photos shared.DevicePhotosManager) *PhotosWrapper {
	return &PhotosWrapper{photos}
}

type AppContext struct {
	WebDir     string
	Platform   string
	ServerPort int
	DataDir    string
	db         *dbKit.DBService
	Photos     *PhotosWrapper
}

func NewAppContext() *AppContext {
	return &AppContext{
		WebDir:     "",
		Platform:   "cli",
		ServerPort: 6457,
		DataDir:    "./data",
		db:         nil,
		Photos:     nil,
	}
}

type HomeCloudApp struct {
	Started       bool
	appCtx        *AppContext
	server        *EmbeddedServer
	onServerStart *func()
}

func NewHomeCloudApp(appCtx *AppContext) *HomeCloudApp {
	return &HomeCloudApp{appCtx: appCtx, server: nil, Started: false}
}

func (c *HomeCloudApp) Start() {
	if c.Started {
		fmt.Println("[ERROR] HomeCloudApp instance already up")
		return
	}
	c.server = NewEmbeddedServer()
	c.server.OnReady(c.onServerStart)
	c.appCtx.db = dbKit.NewDBService(c.appCtx.DataDir + "/homecloud.db")
	c.server.Start(c.appCtx.WebDir, c.appCtx.ServerPort)
	// test
	if c.appCtx.Photos != nil {
		c.appCtx.Photos.PhotosTest()
	}
	c.appCtx.db.Trial()
	c.Started = true
}

func (c *HomeCloudApp) OnServerStart(cb *func()) {
	c.onServerStart = cb
}
