package proxy

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/utils"

	"github.com/valyala/fasthttp"
)

var client = &fasthttp.Client{
	NoDefaultUserAgentHeader: true,
	DisablePathNormalizing:   true,
}

var lock sync.RWMutex

// WithTlsConfig update http client with a user specified tls.config
// This function should be called before Do and Forward.
// Deprecated: use WithClient instead.
//
//nolint:stylecheck,revive // TODO: Rename to "WithTLSConfig" in v3
func WithTlsConfig(tlsConfig *tls.Config) {
	client.TLSConfig = tlsConfig
}

// WithClient sets the global proxy client.
// This function should be called before Do and Forward.
func WithClient(cli *fasthttp.Client) {
	lock.Lock()
	defer lock.Unlock()
	client = cli
}

// Do performs the given http request and fills the given http response.
// This method can be used within a fiber.Handler
func Do(c *fiber.Ctx, addr string, clients ...*fasthttp.Client) error {
	return doAction(c, addr, func(cli *fasthttp.Client, req *fasthttp.Request, resp *fasthttp.Response) error {
		return cli.Do(req, resp)
	}, clients...)
}

// DoTimeout performs the given request and waits for response during the given timeout duration.
// This method can be used within a fiber.Handler
func DoTimeout(c *fiber.Ctx, addr string, timeout time.Duration, clients ...*fasthttp.Client) error {
	return doAction(c, addr, func(cli *fasthttp.Client, req *fasthttp.Request, resp *fasthttp.Response) error {
		return cli.DoTimeout(req, resp, timeout)
	}, clients...)
}

func doAction(
	c *fiber.Ctx,
	addr string,
	action func(cli *fasthttp.Client, req *fasthttp.Request, resp *fasthttp.Response) error,
	clients ...*fasthttp.Client,
) error {
	var cli *fasthttp.Client

	// set local or global client
	if len(clients) != 0 {
		cli = clients[0]
	} else {
		lock.RLock()
		cli = client
		lock.RUnlock()
	}
	fmt.Println("cli", cli)
	req := c.Request()
	res := c.Response()
	originalURL := utils.CopyString(c.OriginalURL())
	defer req.SetRequestURI(originalURL)

	copiedURL := utils.CopyString(addr)
	req.SetRequestURI(copiedURL)
	// NOTE: if req.isTLS is true, SetRequestURI keeps the scheme as https.
	// Reference: https://github.com/gofiber/fiber/issues/1762
	if scheme := getScheme(utils.UnsafeBytes(copiedURL)); len(scheme) > 0 {
		req.URI().SetSchemeBytes(scheme)
	}

	req.Header.Del(fiber.HeaderConnection)
	if err := action(cli, req, res); err != nil {
		return err
	}
	res.Header.Del(fiber.HeaderConnection)
	return nil
}

func getScheme(uri []byte) []byte {
	i := bytes.IndexByte(uri, '/')
	if i < 1 || uri[i-1] != ':' || i == len(uri)-1 || uri[i+1] != '/' {
		return nil
	}
	return uri[:i-1]
}
