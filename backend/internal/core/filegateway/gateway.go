package filegateway

import (
	"context"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"os"
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
	StorageLocal    StorageType = "minio"  // MinIO — 교내 교사 파일
	StorageCloud    StorageType = "wasabi" // Wasabi S3 — 웹·앱 파일
	StorageDiskFS   StorageType = "disk"   // Local filesystem fallback
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

// Gateway provides a unified file upload/download interface across MinIO, Wasabi, and local disk.
type Gateway struct {
	db           *gorm.DB
	minioClient  *minio.Client
	wasabiClient *minio.Client
	minioBucket  string
	wasabiBucket string
	localDir     string // fallback local filesystem directory
}

// NewGateway creates a new file gateway with MinIO and optionally Wasabi connections.
// Falls back to local filesystem if MinIO is unavailable.
func NewGateway(db *gorm.DB, cfg GatewayConfig) (*Gateway, error) {
	gw := &Gateway{
		db:           db,
		minioBucket:  cfg.MinIOBucket,
		wasabiBucket: cfg.WasabiBucket,
	}

	// Prepare local fallback directory
	gw.localDir = filepath.Join(".", "uploads")
	if err := os.MkdirAll(gw.localDir, 0755); err != nil {
		log.Printf("⚠️ Failed to create local uploads dir: %v", err)
	}

	// Connect to MinIO
	minioClient, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		log.Printf("⚠️ MinIO client creation failed (will use local disk): %v", err)
	} else {
		// Verify MinIO is actually reachable
		ctx := context.Background()
		exists, err := minioClient.BucketExists(ctx, cfg.MinIOBucket)
		if err != nil {
			log.Printf("⚠️ MinIO unreachable (will use local disk): %v", err)
		} else {
			gw.minioClient = minioClient
			if !exists {
				if err := minioClient.MakeBucket(ctx, cfg.MinIOBucket, minio.MakeBucketOptions{}); err != nil {
					log.Printf("⚠️ Failed to create MinIO bucket: %v", err)
				} else {
					log.Printf("✅ MinIO bucket '%s' created", cfg.MinIOBucket)
				}
			}
			log.Println("✅ Connected to MinIO")
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

	if gw.minioClient == nil && gw.wasabiClient == nil {
		log.Println("📁 File Gateway initialized (local disk fallback mode)")
	} else {
		log.Println("✅ File Gateway initialized")
	}
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
	// Generate unique object key
	ext := filepath.Ext(header.Filename)
	objectKey := fmt.Sprintf("%s/%s/%s/%s%s",
		pluginID,
		schoolID.String(),
		time.Now().Format("2006/01"),
		uuid.New().String(),
		ext,
	)

	// Determine storage target
	storage, client, bucket := gw.resolveStorage(storageHint, header.Filename)
	contentType := header.Header.Get("Content-Type")

	uploaded := false

	// Try S3-compatible storage first — stream directly without reading all into memory
	if client != nil {
		ctx := context.Background()
		_, err := client.PutObject(ctx, bucket, objectKey, file, header.Size, minio.PutObjectOptions{
			ContentType: contentType,
		})
		if err != nil {
			log.Printf("⚠️ S3 upload failed, falling back to disk: %v", err)
			// Reset file position for disk fallback
			if seeker, ok := file.(io.Seeker); ok {
				seeker.Seek(0, io.SeekStart)
			}
		} else {
			uploaded = true
		}
	}

	// Fallback to local disk
	if !uploaded {
		storage = StorageDiskFS
		bucket = "uploads"
		diskPath := filepath.Join(gw.localDir, objectKey)
		if err := os.MkdirAll(filepath.Dir(diskPath), 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory: %w", err)
		}
		dst, err := os.Create(diskPath)
		if err != nil {
			return nil, fmt.Errorf("failed to create file: %w", err)
		}
		defer dst.Close()
		if _, err := io.Copy(dst, file); err != nil {
			return nil, fmt.Errorf("failed to write file to disk: %w", err)
		}
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
		ContentType: contentType,
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

	// Handle local disk storage
	if record.Storage == StorageDiskFS {
		diskPath := filepath.Join(gw.localDir, record.ObjectKey)
		f, err := os.Open(diskPath)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to open file: %w", err)
		}
		return &record, f, nil
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

	if record.Storage == StorageDiskFS {
		diskPath := filepath.Join(gw.localDir, record.ObjectKey)
		_ = os.Remove(diskPath)
	} else {
		client := gw.getClient(record.Storage)
		if client != nil {
			ctx := context.Background()
			_ = client.RemoveObject(ctx, record.Bucket, record.ObjectKey, minio.RemoveObjectOptions{})
		}
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
		if gw.minioClient != nil {
			return StorageLocal, gw.minioClient, gw.minioBucket
		}
		return StorageDiskFS, nil, "uploads"
	case "local":
		if gw.minioClient != nil {
			return StorageLocal, gw.minioClient, gw.minioBucket
		}
		return StorageDiskFS, nil, "uploads"
	default:
		// Auto: images → Wasabi, documents → MinIO, fallback → disk
		ext := strings.ToLower(filepath.Ext(filename))
		imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".svg": true}
		if imageExts[ext] && gw.wasabiClient != nil {
			return StorageCloud, gw.wasabiClient, gw.wasabiBucket
		}
		if gw.minioClient != nil {
			return StorageLocal, gw.minioClient, gw.minioBucket
		}
		return StorageDiskFS, nil, "uploads"
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
