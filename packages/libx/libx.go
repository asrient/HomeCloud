// Copyright 2015 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Package hello is a trivial package for gomobile bind example.
package libx

import "fmt"

func Greetings(name string) string {
	return fmt.Sprintf("Meoww, %s!", name)
}

type Counter struct {
	Value int
}

func (c *Counter) Inc()             { c.Value++ }
func (c *Counter) ToString() string { return fmt.Sprintf("%d", c.Value) }

func NewCounter() *Counter { return &Counter{5} }
