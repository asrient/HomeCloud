package shared

import (
	"homecloud/app/kits/dbKit"
)

type AppContext struct {
	WebDir     string
	Platform   string
	ServerPort int
	DataDir    string
	Db         *dbKit.DBService
	Photos     *PhotosWrapper
}

func NewAppContext() *AppContext {
	return &AppContext{
		WebDir:     "",
		Platform:   "cli",
		ServerPort: 6457,
		DataDir:    "./data",
		Db:         nil,
		Photos:     nil,
	}
}
