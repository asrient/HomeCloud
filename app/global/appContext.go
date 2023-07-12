package global

type AppContext struct {
	WebDir     string
	Platform   string
	ServerPort int
	DataDir    string
}

var AppCtx AppContext

func InitializeAppContext() {
	AppCtx = AppContext{
		WebDir:     "",
		Platform:   "cli",
		ServerPort: 6457,
		DataDir:    "./data",
	}
}
