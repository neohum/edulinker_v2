package main

import (
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/edulinker/backend/internal/config"
	"github.com/edulinker/backend/internal/core/aigateway"
	"github.com/edulinker/backend/internal/core/auth"
	"github.com/edulinker/backend/internal/core/filegateway"
	"github.com/edulinker/backend/internal/core/handlers"
	applogger "github.com/edulinker/backend/internal/core/logger"
	"github.com/edulinker/backend/internal/core/middleware"
	"github.com/edulinker/backend/internal/core/notify"
	"github.com/edulinker/backend/internal/core/rag"
	"github.com/edulinker/backend/internal/core/registry"
	"github.com/edulinker/backend/internal/core/syncagent"
	"github.com/edulinker/backend/internal/database"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/edulinker/backend/internal/plugins/aianalysis"
	"github.com/edulinker/backend/internal/plugins/announcement"
	"github.com/edulinker/backend/internal/plugins/attendance"
	"github.com/edulinker/backend/internal/plugins/classmgmt"
	"github.com/edulinker/backend/internal/plugins/curriculum"
	"github.com/edulinker/backend/internal/plugins/gatong"
	"github.com/edulinker/backend/internal/plugins/knowledge"
	"github.com/edulinker/backend/internal/plugins/linker"
	"github.com/edulinker/backend/internal/plugins/messenger"
	"github.com/edulinker/backend/internal/plugins/pcinfo"
	"github.com/edulinker/backend/internal/plugins/resourcemgmt"
	"github.com/edulinker/backend/internal/plugins/schooladmin"
	"github.com/edulinker/backend/internal/plugins/schoolevents"
	"github.com/edulinker/backend/internal/plugins/sendoc"
	"github.com/edulinker/backend/internal/plugins/studentalert"
	"github.com/edulinker/backend/internal/plugins/studentmgmt"
	"github.com/edulinker/backend/internal/plugins/teacherscreen"
	"github.com/edulinker/backend/internal/plugins/todo"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Configuration load failed: %v\n", err)
		os.Exit(1)
	}

	// Initialize structured logger
	isPretty := cfg.LogLevel == "debug" || os.Getenv("ENV") != "production"
	applogger.Init(cfg.LogLevel, isPretty)
	log := &applogger.Log

	// Connect to database
	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Fatal().Err(err).Msg("Database connection failed")
	}

	// Run migrations (includes Notification and FileRecord tables)
	if err := database.AutoMigrate(db); err != nil {
		log.Fatal().Err(err).Msg("Migration failed")
	}

	// Seed phase 1 plugins
	if err := database.SeedPlugins(db); err != nil {
		log.Fatal().Err(err).Msg("Seed failed")
	}

	// Connect to Redis
	rdb, err := database.ConnectRedis(cfg.Redis)
	if err != nil {
		log.Warn().Err(err).Msg("Redis connection failed (non-fatal)")
	}

	// Initialize services
	authSvc := auth.NewService(cfg.JWT.Secret, cfg.JWT.ExpiryHours, cfg.JWT.RefreshExpiryHr)

	// Initialize WebSocket Hub
	wsHub := notify.NewHub(rdb)
	go wsHub.Run()

	// Initialize Notification Service
	notifySvc := notify.NewNotificationService(db, wsHub)

	// Initialize File Gateway
	fileGW, err := filegateway.NewGateway(db, filegateway.GatewayConfig{
		MinIOEndpoint:   cfg.MinIO.Endpoint,
		MinIOAccessKey:  cfg.MinIO.AccessKey,
		MinIOSecretKey:  cfg.MinIO.SecretKey,
		MinIOBucket:     cfg.MinIO.Bucket,
		MinIOUseSSL:     cfg.MinIO.UseSSL,
		WasabiEndpoint:  cfg.Wasabi.Endpoint,
		WasabiAccessKey: cfg.Wasabi.AccessKey,
		WasabiSecretKey: cfg.Wasabi.SecretKey,
		WasabiBucket:    cfg.Wasabi.Bucket,
		WasabiRegion:    cfg.Wasabi.Region,
	})
	if err != nil {
		log.Warn().Err(err).Msg("File Gateway initialization failed (non-fatal)")
	}

	// Initialize AI Gateway (Proxy to local Ollama)
	ollamaURL := strings.TrimRight(os.Getenv("OLLAMA_URL"), "/")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}
	aiSvc := aigateway.NewService(ollamaURL)

	// Initialize RAG Service
	ragSvc := rag.NewService(db, aiSvc)

	// Initialize plugin manager & register Phase 1 plugins
	pluginMgr := registry.NewManager()

	msgPlugin := messenger.New(db, wsHub)
	todoPlugin := todo.New(db)
	annPlugin := announcement.New(db, notifySvc, ragSvc)
	alertPlugin := studentalert.New(db, notifySvc)
	attnPlugin := attendance.New(db, notifySvc)
	gatongPlugin := gatong.New(db, notifySvc, ragSvc)
	sendocPlugin := sendoc.New(db)
	smPlugin := studentmgmt.New(db)
	curriculumPlugin := curriculum.New(db, ragSvc)
	aiPlugin := aianalysis.New(db)
	eventsPlugin := schoolevents.New(db, ragSvc)
	linkerPlugin := linker.New(db)
	pcPlugin := pcinfo.New(db)
	screenPlugin := teacherscreen.New(db)
	classPlugin := classmgmt.New(db, ragSvc)
	resourcePlugin := resourcemgmt.New(db)
	adminPlugin := schooladmin.New(db)
	knowledgePlugin := knowledge.New(db, ollamaURL)

	pluginMgr.Register(msgPlugin)
	pluginMgr.Register(todoPlugin)
	pluginMgr.Register(annPlugin)
	pluginMgr.Register(alertPlugin)
	pluginMgr.Register(attnPlugin)
	pluginMgr.Register(gatongPlugin)
	pluginMgr.Register(sendocPlugin)
	pluginMgr.Register(smPlugin)
	pluginMgr.Register(curriculumPlugin)
	pluginMgr.Register(aiPlugin)
	pluginMgr.Register(eventsPlugin)
	pluginMgr.Register(linkerPlugin)
	pluginMgr.Register(pcPlugin)
	pluginMgr.Register(screenPlugin)
	pluginMgr.Register(classPlugin)
	pluginMgr.Register(resourcePlugin)
	pluginMgr.Register(adminPlugin)
	pluginMgr.Register(knowledgePlugin)

	// Initialize AdminHeartbeat (학교 → admin-web 단방향 상태 보고)
	adminHeartbeat := syncagent.NewAdminHeartbeat(db)
	adminHeartbeat.Start()

	// Initialize SyncAgent (Bridge to Cloud)
	syncURL := os.Getenv("SYNC_SERVER_URL")
	if syncURL == "" {
		syncURL = "https://edulinker-sync-server-production.up.railway.app/api/sync"
	}
	agent := syncagent.New(db, syncURL)
	syncagent.RegisterProvider("announcement", annPlugin)
	syncagent.RegisterProvider("schoolevents", eventsPlugin)
	syncagent.RegisterProvider("curriculum", curriculumPlugin)
	syncagent.RegisterProvider("sendoc", sendocPlugin)

	// Register parent student sync provider
	parentSyncProvider := syncagent.NewParentSyncProvider(db, syncURL, wsHub)
	syncagent.RegisterProvider("parent_link", parentSyncProvider)
	agent.Start()

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName:      "edulinker API v1.0.0",
		BodyLimit:    100 * 1024 * 1024, // 100MB (covers file uploads; was 1GB)
		ReadTimeout:  10 * time.Minute,
		WriteTimeout: 10 * time.Minute,
		IdleTimeout:  2 * time.Minute,
		ErrorHandler: customErrorHandler,
	})

	// Global middleware
	app.Use(recover.New())
	app.Use(middleware.SecurityHeaders())
	app.Use(applogger.RequestIDMiddleware())
	app.Use(applogger.RequestLoggerMiddleware())
	app.Use(func(c *fiber.Ctx) error {
		c.Set("Access-Control-Allow-Private-Network", "true")
		return c.Next()
	})

	app.Use(cors.New(cors.Config{
		AllowOriginsFunc: func(origin string) bool {
			// Automatically permit all cross-origins locally and statically to unblock Wails/WebView2
			return true
		},
		AllowMethods:     "GET,POST,PUT,DELETE,PATCH,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Request-ID,X-Device-ID,Access-Control-Request-Private-Network",
		AllowCredentials: true,
	}))

	// --- Static files ---
	app.Static("/uploads", "./uploads")

	// --- Health check ---
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":     "ok",
			"service":    "edulinker-api",
			"version":    "1.0.0",
			"ws_clients": wsHub.OnlineCount(),
		})
	})

	// --- WebSocket endpoint ---
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get("/ws/connect", websocket.New(func(conn *websocket.Conn) {
		// Parse token from query parameter
		tokenStr := conn.Query("token", "")
		if tokenStr == "" {
			conn.Close()
			return
		}

		claims, err := authSvc.ValidateToken(tokenStr)
		if err != nil {
			conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"invalid token"}`))
			conn.Close()
			return
		}

		client := &notify.Client{
			ID:       claims.UserID,
			SchoolID: claims.SchoolID,
			Role:     string(claims.Role),
			Conn:     conn,
			Send:     make(chan []byte, 256),
		}

		wsHub.Register(client)
		go notify.WritePump(client)
		notify.ReadPump(client, wsHub)
	}))

	// --- Public routes (no auth) ---
	authHandler := handlers.NewAuthHandler(db, authSvc)
	schoolHandler := handlers.NewSchoolHandler(db)
	api := app.Group("/api")

	authRoutes := api.Group("/auth", middleware.AuthRateLimiter(cfg.RateLimit.AuthPerMin))
	authRoutes.Post("/login", authHandler.Login)
	authRoutes.Post("/student-login", authHandler.StudentLogin)
	authRoutes.Post("/refresh", authHandler.Refresh)
	authRoutes.Post("/register", authHandler.Register)
	api.Post("/setup", middleware.AuthRateLimiter(cfg.RateLimit.AuthPerMin), schoolHandler.SetupSchool)

	// --- Public parent routes (no auth) ---
	parentHandler := handlers.NewParentHandler(db)
	ragHandler := handlers.NewRAGHandler(db, ragSvc)
	parentRoutes := api.Group("/parent")
	parentRoutes.Get("/students/search", parentHandler.SearchStudents)
	parentRoutes.Post("/link", parentHandler.LinkParent)

	// --- Protected routes (require auth) ---
	protected := api.Group("", middleware.AuthMiddleware(authSvc))
	protected.Get("/auth/me", authHandler.Me)
	protected.Get("/parent/my-students", parentHandler.GetLinkedStudents)
	protected.Get("/parent/student-links", parentHandler.GetStudentParentStatus)
	protected.Post("/parent/auto-link", parentHandler.AutoLinkStudents)
	protected.Post("/parent/ai/query", ragHandler.Query)
	protected.Get("/parent/ai/history", ragHandler.GetHistory)

	// --- Device management ---
	deviceHandler := handlers.NewDeviceHandler(db)
	deviceRoutes := protected.Group("/core/devices", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))
	deviceRoutes.Post("/register", deviceHandler.RegisterDevice)
	deviceRoutes.Get("/", deviceHandler.ListDevices)
	deviceRoutes.Delete("/:id", deviceHandler.DeactivateDevice)

	// Mount AI Gateway under protected group
	aiSvc.RegisterRoutes(protected.Group("/core"))

	// --- Core plugin management ---
	pluginHandler := handlers.NewPluginHandler(db)
	coreRoutes := protected.Group("/core")
	coreRoutes.Get("/plugins", pluginHandler.ListPlugins)
	coreRoutes.Put("/plugins/:id/toggle", middleware.RoleMiddleware(models.RoleAdmin), pluginHandler.TogglePlugin)
	coreRoutes.Get("/plugins/:id/status", pluginHandler.GetPluginStatus)

	// --- School management ---
	coreRoutes.Get("/school", schoolHandler.GetSchool)
	coreRoutes.Get("/schools", middleware.RoleMiddleware(models.RoleAdmin), schoolHandler.ListSchools)

	// --- User management ---
	userHandler := handlers.NewUserHandler(db)
	userRoutes := coreRoutes.Group("/users")
	userRoutes.Post("/", middleware.RoleMiddleware(models.RoleAdmin), userHandler.CreateUser)
	userRoutes.Post("/add-student", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin), userHandler.AddStudent)
	userRoutes.Post("/import-students", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin), userHandler.ImportStudentsExcel)
	userRoutes.Get("/student-template", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin), userHandler.DownloadStudentTemplate)
	userRoutes.Delete("/students-by-class", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin), userHandler.DeleteStudentsByClass)
	userRoutes.Post("/delete-students-batch", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin), userHandler.DeleteStudentsBatch)
	userRoutes.Get("/", userHandler.ListUsers)
	userRoutes.Get("/inactive", middleware.RoleMiddleware(models.RoleAdmin), userHandler.ListInactiveUsers)
	userRoutes.Get("/:id", userHandler.GetUser)
	userRoutes.Put("/:id", userHandler.UpdateUser)
	userRoutes.Put("/:id/password", userHandler.ChangePassword)
	userRoutes.Post("/:id/reset-pin", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin), userHandler.ResetPIN)
	userRoutes.Post("/:id/change-pin", middleware.RoleMiddleware(models.RoleStudent, models.RoleTeacher, models.RoleAdmin), userHandler.ChangePIN)
	userRoutes.Delete("/:id", middleware.RoleMiddleware(models.RoleAdmin), userHandler.DeleteUser)
	userRoutes.Post("/:id/reactivate", middleware.RoleMiddleware(models.RoleAdmin), userHandler.ReactivateUser)
	userRoutes.Delete("/:id/permanent", middleware.RoleMiddleware(models.RoleAdmin), userHandler.HardDeleteUser)

	// --- Notification management ---
	notifyHandler := handlers.NewNotifyHandler(notifySvc)
	notifyRoutes := coreRoutes.Group("/notifications")
	notifyRoutes.Post("/send", notifyHandler.SendNotification)
	notifyRoutes.Get("/", notifyHandler.GetNotifications)
	notifyRoutes.Put("/:id/read", notifyHandler.MarkRead)
	notifyRoutes.Put("/read-all", notifyHandler.MarkAllRead)

	// --- File management ---
	if fileGW != nil {
		fileHandler := handlers.NewFileHandler(fileGW)
		fileRoutes := coreRoutes.Group("/files", middleware.UploadRateLimiter(cfg.RateLimit.UploadPerMin))
		fileRoutes.Post("/upload", fileHandler.Upload)
		fileRoutes.Get("/", fileHandler.ListFiles)
		fileRoutes.Get("/:id", fileHandler.Download)
		fileRoutes.Delete("/:id", fileHandler.Delete)
	}

	// --- Mount plugin routes (under auth-protected group) ---
	pluginMgr.MountRoutes(protected)

	// Start server
	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)
	log.Info().Str("addr", addr).Msg("edulinker API server starting")

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	<-quit
	log.Info().Msg("Shutting down server...")
	wsHub.Stop()
	if err := app.Shutdown(); err != nil {
		log.Fatal().Err(err).Msg("Server shutdown failed")
	}
	log.Info().Msg("Server stopped")
}

func customErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}
	return c.Status(code).JSON(fiber.Map{
		"error": err.Error(),
	})
}
