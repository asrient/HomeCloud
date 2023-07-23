package routes

import (
	"fmt"
	"homecloud/app/helpers"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func Ws(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	relayTragetId, err := helpers.GetRelayNodeId(r)
	if err != nil {
		helpers.WsManager.AddClient(conn)
		fmt.Println("Client connected")
	} else {
		remoteAddr := helpers.SdManager.GetAddrOfNodeId(relayTragetId)
		if remoteAddr == "" {
			conn.WriteMessage(websocket.TextMessage, []byte("Node not known"))
			conn.Close()
			return
		}
		newUrl := helpers.GetRelayTargetUrl("ws", remoteAddr, r)
		headers := http.Header{}
		helpers.CopyRelayHeaders(r, headers)
		helpers.WsManager.Relay(conn, newUrl, headers)
	}
}
