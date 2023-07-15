package main

import (
	"fmt"
	"homecloud/app"
	"homecloud/app/global"
	"os"
)

// Path: cli/main.go

func main() {
	fmt.Println("Starting HomeCloud...")
	fmt.Println("[HomeCloud] Args:", os.Args)
	v := 4
	co := app.NewHomeCloudApp(nil)
	global.AppCtx.DataDir = "./data"
	global.AppCtx.WebDir = "./ui/dist"
	co.OnServerStart(func() {
		fmt.Println("Server is ready", v)
	})
	co.Start()
	select {}
}
