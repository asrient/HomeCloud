package shared

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
