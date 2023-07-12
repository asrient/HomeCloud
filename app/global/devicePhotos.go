package global

import (
	"fmt"
	"homecloud/app/shared"
)

type DevicePhotosService struct {
	shared.DevicePhotosManager
	photoBufferCallbacks map[string]func([]byte)
	nextRequestId        int
	IsInitilized         bool
}

var DevicePhotos DevicePhotosService

func (c *DevicePhotosService) OnPermissionChange(granted bool) {
	fmt.Println("[OnPermissionChange] granted", granted)
}

func (c *DevicePhotosService) OnPhotoData(requestId string, data []byte) {
	fmt.Println("[OnPhotoData] requestId", requestId, "data", data)
}

func (c *DevicePhotosService) GetPhotoBuffer(photoId string, cb func([]byte)) {
	req := fmt.Sprintf("request#%d", c.nextRequestId)
	c.nextRequestId = (c.nextRequestId + 1) % 999 // todo: Handle long due callbacks more gracefully
	c.photoBufferCallbacks[req] = cb
	c.DevicePhotosManager.GetPhotoBuffer(req, photoId)
}

func (c *DevicePhotosService) PhotosTest() {
	fmt.Println("[photosTest] start")
	fmt.Println("[photosTest] is permission granted", c.IsPermissionGranted())
	fmt.Println("[photosTest] request permission", c.RequestPermission())
	fmt.Println("[photosTest] get photos", c.GetPhotos(":all", 0, 10))
	fmt.Println("[photosTest] get albums", c.GetAlbums())
	c.GetPhotoBuffer("1", func(data []byte) {
		fmt.Println("[photosTest] get photo buffer callback", data)
	})
}

func InitializeDevicePhotos(photos shared.DevicePhotosManager) {
	DevicePhotos = DevicePhotosService{photos, make(map[string]func([]byte)), 0, true}
	photos.Setup(&DevicePhotos)
}
