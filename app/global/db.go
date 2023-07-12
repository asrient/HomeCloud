package global

import (
	"fmt"

	"homecloud/app/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var Db *gorm.DB

func InitializeDb() {
	fmt.Println("[DB] Starting DB...")
	dbPath := AppCtx.DataDir + "/homecloud.db"
	var err error
	Db, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}
	fmt.Println("[DB] DB started")
}

func MigrateDb() {
	// Migrate the schemas here:
	Db.AutoMigrate(&models.Node{})
}

func DbTrial() {
	fmt.Println("[DB] Trial")
	// Create
	Db.Create(&models.Node{Hash: "D42", Id: 100, Name: "Test Node"})

	// Read
	var node models.Node
	Db.First(&node, 1)                 // find node with integer primary key
	Db.First(&node, "Hash = ?", "D42") // find node with code D42

	// Update - update node's price to 200
	Db.Model(&node).Update("Id", 200)
	// Update - update multiple fields
	Db.Model(&node).Updates(models.Node{Id: 200, Hash: "F42"}) // non-zero fields
	Db.Model(&node).Updates(map[string]interface{}{"Id": 200, "Hash": "F42"})

	// Delete - delete node
	Db.Delete(&node, 1)
	fmt.Println("[DB] Trial done")
}
