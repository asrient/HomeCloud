package shared

type PermissionCallback interface {
	OnPermissionChange(granted bool)
}

type DevicePhotosManager interface {
	IsPermissionGranted() bool
	RequestPermission(cb PermissionCallback) bool
	GetPhotos(albumId string, start int, limit int) string
	GetAlbums() string
	DeletePhotos(photoIds string) string
	GetPhotoBuffer(photoId string) []byte
}
