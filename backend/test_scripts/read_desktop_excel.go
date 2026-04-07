package main

import (
	"fmt"
	"log"
	"strings"
	"github.com/xuri/excelize/v2"
)

func main() {
	f, err := excelize.OpenFile(`C:\Users\user\Desktop\student_template.xlsx`)
	if err != nil {
		log.Fatalf("Error opening file: %v", err)
	}
	defer f.Close()

	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		log.Fatalf("Error reading rows: %v", err)
	}

	if len(rows) < 1 {
		log.Fatal("File is empty")
	}

	header := rows[0]
	fmt.Println("=== Headers ===")
	for i, c := range header {
		fmt.Printf("Col %d: '%s' (cleaned: '%s')\n", i, c, strings.ReplaceAll(strings.TrimSpace(c), " ", ""))
	}

	fmt.Println("\n=== Rows ===")
	for i, row := range rows[1:] {
		if i > 5 { break } // Only print up to 5 rows
		fmt.Printf("Row %d length: %d\n", i+2, len(row))
		for j, c := range row {
			fmt.Printf("  Col %d: '%s'\n", j, c)
		}
	}
}
