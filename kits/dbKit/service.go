package dbKit

import (
	"fmt"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type Product struct {
	gorm.Model
	Code  string
	Price uint
}

type DBService struct {
	dbPath string
	*gorm.DB
}

func (c *DBService) Trial() {
	fmt.Println("[DB] Trial")
	// Create
	c.Create(&Product{Code: "D42", Price: 100})

	// Read
	var product Product
	c.First(&product, 1)                 // find product with integer primary key
	c.First(&product, "code = ?", "D42") // find product with code D42

	// Update - update product's price to 200
	c.Model(&product).Update("Price", 200)
	// Update - update multiple fields
	c.Model(&product).Updates(Product{Price: 200, Code: "F42"}) // non-zero fields
	c.Model(&product).Updates(map[string]interface{}{"Price": 200, "Code": "F42"})

	// Delete - delete product
	c.Delete(&product, 1)
	fmt.Println("[DB] Trial done")
}

func NewDBService(dbPath string) *DBService {
	fmt.Println("[DB] Starting DB...")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}
	fmt.Println("[DB] DB started")

	// Migrate the schemas
	db.AutoMigrate(&Product{})
	return &DBService{DB: db, dbPath: dbPath}
}
