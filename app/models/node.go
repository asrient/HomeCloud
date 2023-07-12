package models

import (
	"gorm.io/gorm"
)

type Node struct {
	gorm.Model
	Hash string
	Id   uint
	Name string
}
