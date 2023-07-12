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
	co := app.NewHomeCloudApp(nil)
	global.AppCtx.DataDir = "./data"
	global.AppCtx.WebDir = "./ui/dist"
	co.Start()
	select {}
}
