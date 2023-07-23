package helpers

import (
	"io"
	"net/http"

	"github.com/gorilla/websocket"
)

type WsManagerType struct {
	clients map[string]*websocket.Conn
}

func (c *WsManagerType) AddClient(client *websocket.Conn) {
	c.clients[client.RemoteAddr().String()] = client
	client.WriteMessage(websocket.TextMessage, []byte("Hello"))
}

func (c *WsManagerType) RemoveClient(client *websocket.Conn) {
	delete(c.clients, client.RemoteAddr().String())
}

// reference: https://github.com/isobit/ws-tcp-relay/blob/master/ws-tcp-relay.go

func copyWorker(dst io.Writer, src io.Reader, doneCh chan<- bool) {
	io.Copy(dst, src)
	doneCh <- true
}

func (c *WsManagerType) Relay(source *websocket.Conn, targetUrl string, sourceHeaders http.Header) {
	target, _, err := websocket.DefaultDialer.Dial(targetUrl, sourceHeaders)
	if err != nil {
		source.WriteMessage(websocket.TextMessage, []byte(err.Error()))
		source.Close()
		return
	}
	doneCh := make(chan bool)
	go copyWorker(source.UnderlyingConn(), target.UnderlyingConn(), doneCh)
	go copyWorker(target.UnderlyingConn(), source.UnderlyingConn(), doneCh)
	<-doneCh
	source.Close()
	target.Close()
	<-doneCh
}

var WsManager *WsManagerType

func init() {
	WsManager = &WsManagerType{clients: make(map[string]*websocket.Conn)}
}
