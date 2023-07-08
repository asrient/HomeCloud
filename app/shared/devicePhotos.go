package shared

import (
	"fmt"
)

type DevicePhotosCallbacks interface {
	OnPermissionChange(granted bool)
	OnPhotoData(requestId string, data []byte)
}

type DevicePhotosManager interface {
	IsPermissionGranted() bool
	RequestPermission() bool
	GetPhotos(albumId string, start int, limit int) string
	GetAlbums() string
	DeletePhotos(photoIds string) string
	GetPhotoBuffer(requestId string, photoId string)
	Setup(cb DevicePhotosCallbacks)
}

type PhotosWrapper struct {
	DevicePhotosManager
	photoBufferCallbacks map[string]func([]byte)
	nextRequestId        int
}

func (c *PhotosWrapper) OnPermissionChange(granted bool) {
	fmt.Println("[OnPermissionChange] granted", granted)
}

func (c *PhotosWrapper) OnPhotoData(requestId string, data []byte) {
	fmt.Println("[OnPhotoData] requestId", requestId, "data", data)
}

func (c *PhotosWrapper) GetPhotoBuffer(photoId string, cb func([]byte)) {
	req := fmt.Sprintf("request#%d", c.nextRequestId)
	c.nextRequestId = (c.nextRequestId + 1) % 999 // todo: Handle long due callbacks more gracefully
	c.photoBufferCallbacks[req] = cb
	c.DevicePhotosManager.GetPhotoBuffer(req, photoId)
}

func (c *PhotosWrapper) PhotosTest() {
	fmt.Println("[photosTest] start")
	fmt.Println("[photosTest] is permission granted", c.IsPermissionGranted())
	fmt.Println("[photosTest] request permission", c.RequestPermission())
	fmt.Println("[photosTest] get photos", c.GetPhotos(":all", 0, 10))
	fmt.Println("[photosTest] get albums", c.GetAlbums())
	c.GetPhotoBuffer("1", func(data []byte) {
		fmt.Println("[photosTest] get photo buffer callback", data)
	})
}

func NewPhotosWrapper(photos DevicePhotosManager) *PhotosWrapper {
	pw := &PhotosWrapper{photos, make(map[string]func([]byte)), 0}
	photos.Setup(pw)
	return pw
}
