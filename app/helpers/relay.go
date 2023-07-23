package helpers

// Reference: https://gist.github.com/yowu/f7dc34bd4736a65ff28d

import (
	"errors"
	"fmt"
	"homecloud/app/global"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// Hop-by-hop headers. These are removed when sent to the backend.
// http://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html
var hopHeaders = []string{
	"Connection",
	"Keep-Alive",
	"Proxy-Authenticate",
	"Proxy-Authorization",
	"Te", // canonicalized version of "TE"
	"Trailers",
	"Transfer-Encoding",
	"Upgrade",
}

func copyHeader(dst, src http.Header) {
	for k, vv := range src {
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}

func delHopHeaders(header http.Header) {
	for _, h := range hopHeaders {
		header.Del(h)
	}
}

func appendHostToXForwardHeader(header http.Header, host string) {
	// If we aren't the first proxy retain prior
	// X-Forwarded-For information as a comma+space
	// separated list and fold multiple headers into one.
	if prior, ok := header["X-Forwarded-For"]; ok {
		host = strings.Join(prior, ", ") + ", " + host
	}
	header.Set("X-Forwarded-For", host)
}

var client = &http.Client{
	Timeout: time.Duration(20 * time.Second),
}

func GetRelayTargetUrl(scheme string, remoteAddr string, req *http.Request) string {
	newUrl := fmt.Sprintf("%s://%s%s", scheme, remoteAddr, req.URL.Path)
	if req.URL.RawQuery != "" {
		newUrl += "?" + req.URL.RawQuery
	}
	fmt.Println("newUrl:", newUrl)
	fmt.Println("req.URL:", req.URL.String())
	return newUrl
}

func CopyRelayHeaders(req *http.Request, h2 http.Header) {
	h1 := req.Header
	copyHeader(h1, h2)
	delHopHeaders(h2)
	if clientIP, _, err := net.SplitHostPort(req.RemoteAddr); err == nil {
		appendHostToXForwardHeader(h2, clientIP)
	}
}

func Proxy(wr http.ResponseWriter, req *http.Request) bool {
	log.Println(req.RemoteAddr, " ", req.Method, " ", req.URL)

	nodeId, err := GetRelayNodeId(req)
	if err != nil {
		return false
	}

	remoteAddr := SdManager.GetAddrOfNodeId(nodeId)
	if remoteAddr == "" {
		http.Error(wr, "Server Error: Node not known", http.StatusInternalServerError)
		log.Print("Proxy:", "Node not known")
		return true
	}
	newUrl := GetRelayTargetUrl("http", remoteAddr, req)

	req2, err := http.NewRequest(req.Method, newUrl, req.Body)

	if err != nil {
		http.Error(wr, "Server Error: Could not connect to target", http.StatusInternalServerError)
		return true
	}

	CopyRelayHeaders(req, req2.Header)

	resp, err := client.Do(req2)
	if err != nil {
		http.Error(wr, "Server Error: Request to target failed", http.StatusInternalServerError)
	}
	defer resp.Body.Close()

	log.Println(req2.RemoteAddr, " ", resp.Status)

	delHopHeaders(resp.Header)

	copyHeader(wr.Header(), resp.Header)
	wr.WriteHeader(resp.StatusCode)
	io.Copy(wr, resp.Body)
	return true
}

func GetRelayNodeId(req *http.Request) (string, error) {
	nodeId := req.Header.Get("X-Node-Id")
	if req.URL.Query().Get("nodeId") != "" {
		nodeId = req.URL.Query().Get("nodeId")
	}
	if nodeId == "localhost:"+fmt.Sprintf("%d", global.AppCtx.ServerPort) {
		log.Println("GetAddrOfNodeId: loopback", nodeId, global.AppCtx.ServerPort)
		nodeId = ""

	}
	if nodeId != "" {
		return nodeId, nil
	}
	return "", errors.New("no relay node id found")
}
