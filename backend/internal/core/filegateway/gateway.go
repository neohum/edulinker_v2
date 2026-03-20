package filegateway

import (
	"context"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"gorm.io/gorm"
)

// StorageType determines where a file is stored.
type StorageType string

const (
	StorageLocal StorageType = "minio"  // MinIO — 교내 교사 파일
	StorageCloud StorageType = "wasabi" // Wasabi S3 — 웹·앱 파일
)

// FileRecord tracks uploaded files in the database.
type FileRecord struct {
	ID          uuid.UUID   `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID    uuid.UUID   `json:"school_id" gorm:"type:uuid;index"`
	UploaderID  uuid.UUID   `json:"uploader_id" gorm:"type:uuid;index"`
	PluginID    string      `json:"plugin_id" gorm:"type:varchar(50)"`
	Storage     StorageType `json:"storage" gorm:"type:varchar(20)"`
	Bucket      string      `json:"bucket" gorm:"type:varchar(100)"`
	ObjectKey   string      `json:"object_key" gorm:"type:varchar(500)"`
	FileName    string      `json:"file_name" gorm:"type:varchar(255)"`
	ContentType string      `json:"content_type" gorm:"type:varchar(100)"`
	Size        int64       `json:"size"`
	CreatedAt   time.Time   `json:"created_at" gorm:"autoCreateTime"`
}

// GatewayConfig holds storage connection settings.
type GatewayConfig struct {
	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinIOBucket    string
	MinIOUseSSL    bool

	WasabiEndpoint  string
	WasabiAccessKey string
	WasabiSecretKey string
	WasabiBucket    string
	WasabiRegion    string
}

// Gateway provides a unified file upload/download interface across MinIO and Wasabi.
type Gateway struct {
	db           *gorm.DB
	minioClient  *minio.Client
	wasabiClient *minio.Client
	minioBucket  string
	wasabiBucket string
}

// NewGateway creates a new file gateway with MinIO and optionally Wasabi connections.
func NewGateway(db *gorm.DB, cfg GatewayConfig) (*Gateway, error) {
	gw := &Gateway{
		db:           db,
		minioBucket:  cfg.MinIOBucket,
		wasabiBucket: cfg.WasabiBucket,
	}

	// Connect to MinIO
	minioClient, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MinIO: %w", err)
	}
	gw.minioClient = minioClient

	// Ensure MinIO bucket exists
	ctx := context.Background()
	exists, err := minioClient.BucketExists(ctx, cfg.MinIOBucket)
	if err != nil {
		log.Printf("⚠️ MinIO bucket check failed: %v", err)
	} else if !exists {
		if err := minioClient.MakeBucket(ctx, cfg.MinIOBucket, minio.MakeBucketOptions{}); err != nil {
			log.Printf("⚠️ Failed to create MinIO bucket: %v", err)
		} else {
			log.Printf("✅ MinIO bucket '%s' created", cfg.MinIOBucket)
		}
	}

	// Connect to Wasabi (optional — skip if no credentials)
	if cfg.WasabiAccessKey != "" && cfg.WasabiSecretKey != "" {
		wasabiClient, err := minio.New(cfg.WasabiEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.WasabiAccessKey, cfg.WasabiSecretKey, ""),
			Secure: true,
			Region: cfg.WasabiRegion,
		})
		if err != nil {
			log.Printf("⚠️ Wasabi connection failed (non-fatal): %v", err)
		} else {
			gw.wasabiClient = wasabiClient
			log.Println("✅ Connected to Wasabi S3")
		}
	}

	log.Println("✅ File Gateway initialized")
	return gw, nil
}

// Upload stores a file and records metadata.
// storageHint: "local" for MinIO, "cloud" for Wasabi, "auto" for automatic routing.
func (gw *Gateway) Upload(
	file multipart.File,
	header *multipart.FileHeader,
	schoolID, uploaderID uuid.UUID,
	pluginID string,
	storageHint string,
) (*FileRecord, error) {
	ctx := context.Background()

	// Determine storage target
	storage, client, bucket := gw.resolveStorage(storageHint, header.Filename)

	// Generate unique object key
	ext := filepath.Ext(header.Filename)
	objectKey := fmt.Sprintf("%s/%s/%s/%s%s",
		pluginID,
		schoolID.String(),
		time.Now().Format("2006/01"),
		uuid.New().String(),
		ext,
	)

	// Upload to storage
	_, err := client.PutObject(ctx, bucket, objectKey, file, header.Size, minio.PutObjectOptions{
		ContentType: header.Header.Get("Content-Type"),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to upload file: %w", err)
	}

	// Save record to DB
	record := &FileRecord{
		SchoolID:    schoolID,
		UploaderID:  uploaderID,
		PluginID:    pluginID,
		Storage:     storage,
		Bucket:      bucket,
		ObjectKey:   objectKey,
		FileName:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Size:        header.Size,
	}
	if err := gw.db.Create(record).Error; err != nil {
		return nil, fmt.Errorf("failed to save file record: %w", err)
	}

	log.Printf("📁 File uploaded: %s → %s/%s (%d bytes)", header.Filename, storage, objectKey, header.Size)
	return record, nil
}

// Download retrieves a file by its record ID.
func (gw *Gateway) Download(fileID uuid.UUID) (*FileRecord, io.ReadCloser, error) {
	var record FileRecord
	if err := gw.db.First(&record, "id = ?", fileID).Error; err != nil {
		return nil, nil, fmt.Errorf("file not found")
	}

	client := gw.getClient(record.Storage)
	if client == nil {
		return nil, nil, fmt.Errorf("storage backend unavailable: %s", record.Storage)
	}

	ctx := context.Background()
	obj, err := client.GetObject(ctx, record.Bucket, record.ObjectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to retrieve file: %w", err)
	}

	return &record, obj, nil
}

// Delete removes a file from storage and DB.
func (gw *Gateway) Delete(fileID uuid.UUID) error {
	var record FileRecord
	if err := gw.db.First(&record, "id = ?", fileID).Error; err != nil {
		return fmt.Errorf("file not found")
	}

	client := gw.getClient(record.Storage)
	if client != nil {
		ctx := context.Background()
		_ = client.RemoveObject(ctx, record.Bucket, record.ObjectKey, minio.RemoveObjectOptions{})
	}

	return gw.db.Delete(&record).Error
}

// ListByPlugin returns files for a given plugin and school.
func (gw *Gateway) ListByPlugin(schoolID uuid.UUID, pluginID string, page, pageSize int) ([]FileRecord, int64, error) {
	query := gw.db.Where("school_id = ? AND plugin_id = ?", schoolID, pluginID)

	var total int64
	query.Model(&FileRecord{}).Count(&total)

	var files []FileRecord
	offset := (page - 1) * pageSize
	query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&files)

	return files, total, nil
}

// ── Internal ──

func (gw *Gateway) resolveStorage(hint, filename string) (StorageType, *minio.Client, string) {
	switch hint {
	case "cloud":
		if gw.wasabiClient != nil {
			return StorageCloud, gw.wasabiClient, gw.wasabiBucket
		}
		return StorageLocal, gw.minioClient, gw.minioBucket
	case "local":
		return StorageLocal, gw.minioClient, gw.minioBucket
	default:
		// Auto: images → Wasabi, documents → MinIO
		ext := strings.ToLower(filepath.Ext(filename))
		imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".svg": true}
		if imageExts[ext] && gw.wasabiClient != nil {
			return StorageCloud, gw.wasabiClient, gw.wasabiBucket
		}
		return StorageLocal, gw.minioClient, gw.minioBucket
	}
}

func (gw *Gateway) getClient(storage StorageType) *minio.Client {
	switch storage {
	case StorageCloud:
		return gw.wasabiClient
	default:
		return gw.minioClient
	}
}
