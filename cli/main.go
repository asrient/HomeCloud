package main

import (
	"fmt"
	"homecloud/app"
	"homecloud/app/global"
	"os"
	"strconv"
)

// Path: cli/main.go

func main() {
	fmt.Println("Starting HomeCloud...")
	fmt.Println("[HomeCloud] Args:", os.Args)
	v := 4
	co := app.NewHomeCloudApp(nil)
	global.AppCtx.DataDir = "./data"
	global.AppCtx.WebDir = "./ui/dist"
	if len(os.Args) > 1 {
		i, err := strconv.Atoi(os.Args[1])
		if err != nil {
			panic(err)
		}
		global.AppCtx.ServerPort = i
	}
	co.OnServerStart(func() {
		fmt.Println("Server is ready", v)
	})
	co.Start()
	select {}
}
