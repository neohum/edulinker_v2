package schoolevents

import (
	"fmt"
	"log"

	"github.com/edulinker/backend/internal/core/middleware"
	"github.com/edulinker/backend/internal/core/rag"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Plugin struct {
	db     *gorm.DB
	ragSvc *rag.Service
}

func New(db *gorm.DB, ragSvc *rag.Service) *Plugin {
	return &Plugin{db: db, ragSvc: ragSvc}
}

func (p *Plugin) ID() string      { return "schoolevents" }
func (p *Plugin) Name() string    { return "학교 행사 및 투표" }
func (p *Plugin) Group() string   { return "H" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error {
	log.Printf("[SchoolEvents] Enabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) OnDisable(schoolID uuid.UUID) error {
	log.Printf("[SchoolEvents] Disabled for school: %s", schoolID)
	return nil
}

// --- SyncProvider Implementation ---
func (p *Plugin) GetSyncData(schoolID string) interface{} {
	var votings []models.SchoolVoting
	p.db.Where("school_id = ?", schoolID).Order("created_at desc").Limit(20).Find(&votings)
	return votings
}

func (p *Plugin) HandleEvent(payload string) error {
	return nil
}

func (p *Plugin) RegisterRoutes(router fiber.Router) {
	api := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin, models.RoleParent, models.RoleStudent))

	api.Get("/votings", p.listVotings)
	api.Get("/records", p.listEventRecords)

	// Write access
	teacherAPI := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))
	teacherAPI.Post("/votings", p.createVoting)
	teacherAPI.Delete("/votings/:id", p.deleteVoting)
	teacherAPI.Post("/records", p.createEventRecord)

	// User interactions (all roles)
	api.Post("/votings/:id/vote", p.submitVote)
	api.Get("/votings/:id/stats", p.getVotingStats)
}

func (p *Plugin) listVotings(c *fiber.Ctx) error {
	schoolID := c.Locals("schoolID").(uuid.UUID)
	userID := c.Locals("userID").(uuid.UUID)

	var votings []models.SchoolVoting
	query := p.db.Where("school_id = ?", schoolID).Order("created_at desc")

	var user models.User
	if err := p.db.First(&user, "id = ?", userID).Error; err == nil {
		roleStr := string(user.Role)
		if roleStr == string(models.RoleStudent) {
			t1 := "STUDENT"
			t2 := fmt.Sprintf("STUDENT_%d", user.Grade)
			t3 := fmt.Sprintf("STUDENT_%d_%d", user.Grade, user.Class)
			query = query.Where("target_roles = 'ALL' OR target_roles LIKE ? OR target_roles LIKE ? OR target_roles LIKE ?", "%"+t1+"%", "%"+t2+"%", "%"+t3+"%")
		} else if roleStr == string(models.RoleParent) {
			t1 := "PARENT"
			t2 := fmt.Sprintf("PARENT_%d", user.Grade)
			t3 := fmt.Sprintf("PARENT_%d_%d", user.Grade, user.Class)
			query = query.Where("target_roles = 'ALL' OR target_roles LIKE ? OR target_roles LIKE ? OR target_roles LIKE ?", "%"+t1+"%", "%"+t2+"%", "%"+t3+"%")
		}
	}

	if err := query.Find(&votings).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list votings"})
	}

	// Fetch my votes
	var myVotes []models.SchoolVotingResponse
	if len(votings) > 0 {
		var votingIDs []uuid.UUID
		for _, v := range votings {
			votingIDs = append(votingIDs, v.ID)
		}
		p.db.Where("user_id = ? AND voting_id IN ?", userID, votingIDs).Find(&myVotes)
	}

	myVoteOptionMap := make(map[uuid.UUID]int)
	myVoteTextMap := make(map[uuid.UUID]string)
	for _, mv := range myVotes {
		myVoteOptionMap[mv.VotingID] = mv.OptionIdx
		myVoteTextMap[mv.VotingID] = mv.ExtraText
	}

	type VotingWithDetails struct {
		models.SchoolVoting
		MyVoteOption *int   `json:"my_vote_option"`
		MyExtraText  string `json:"my_extra_text,omitempty"`
	}

	var results []VotingWithDetails
	for _, v := range votings {
		var myOpt *int
		if opt, ok := myVoteOptionMap[v.ID]; ok {
			optCopy := opt
			myOpt = &optCopy
		}
		textVal := myVoteTextMap[v.ID]
		results = append(results, VotingWithDetails{
			SchoolVoting: v,
			MyVoteOption: myOpt,
			MyExtraText:  textVal,
		})
	}

	return c.JSON(results)
}

func (p *Plugin) createVoting(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var vote models.SchoolVoting
	if err := c.BodyParser(&vote); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	vote.SchoolID = schoolID
	vote.AuthorID = userID

	if err := p.db.Create(&vote).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create voting event"})
	}

	// Index for RAG
	if p.ragSvc != nil {
		go p.ragSvc.IndexDocument(schoolID, "voting", vote.ID, "[투표] "+vote.Title, vote.Content, "")
	}

	return c.Status(fiber.StatusCreated).JSON(vote)
}

func (p *Plugin) deleteVoting(c *fiber.Ctx) error {
	votingIDStr := c.Params("id")
	votingID, err := uuid.Parse(votingIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid voting ID"})
	}

	userID := c.Locals("userID").(uuid.UUID)

	var vote models.SchoolVoting
	if err := p.db.First(&vote, "id = ?", votingID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "voting not found"})
	}

	var user models.User
	if err := p.db.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user not found"})
	}

	if vote.AuthorID != userID && user.Role != models.RoleAdmin {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "not authorized to delete this voting"})
	}

	// Delete vote and its responses
	tx := p.db.Begin()
	if err := tx.Where("voting_id = ?", votingID).Delete(&models.SchoolVotingResponse{}).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete voting responses"})
	}
	if err := tx.Delete(&vote).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete voting"})
	}
	tx.Commit()

	if p.ragSvc != nil {
		// Attempting best-effort delete if RAG supports it (optional, skipped for brevity or if method doesn't exist)
		// For now we just let the record rot in RAG or we need a delete method in rag.Service.
	}

	return c.JSON(fiber.Map{"message": "voting deleted successfully"})
}

func (p *Plugin) submitVote(c *fiber.Ctx) error {
	votingIDStr := c.Params("id")
	votingID, err := uuid.Parse(votingIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid voting ID"})
	}

	userID := c.Locals("userID").(uuid.UUID)

	var payload struct {
		OptionIdx int    `json:"option_idx"`
		ExtraText string `json:"extra_text"`
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	// Upsert vote
	var response models.SchoolVotingResponse
	result := p.db.Where("voting_id = ? AND user_id = ?", votingID, userID).First(&response)
	if result.Error == nil {
		response.OptionIdx = payload.OptionIdx
		response.ExtraText = payload.ExtraText
		p.db.Save(&response)
	} else {
		response = models.SchoolVotingResponse{
			VotingID:  votingID,
			UserID:    userID,
			OptionIdx: payload.OptionIdx,
			ExtraText: payload.ExtraText,
		}
		p.db.Create(&response)
	}

	return c.JSON(fiber.Map{"message": "vote submitted successfully", "option_idx": payload.OptionIdx, "extra_text": response.ExtraText})
}

func (p *Plugin) getVotingStats(c *fiber.Ctx) error {
	votingIDStr := c.Params("id")
	votingID, err := uuid.Parse(votingIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid voting ID"})
	}

	type OptionCount struct {
		OptionIdx int `json:"option_idx"`
		Count     int `json:"count"`
	}

	var counts []OptionCount
	if err := p.db.Model(&models.SchoolVotingResponse{}).
		Select("option_idx, count(id) as count").
		Where("voting_id = ?", votingID).
		Group("option_idx").
		Scan(&counts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch stats"})
	}

	// Fetch extra texts for this voting
	var textResponses []models.SchoolVotingResponse
	p.db.Where("voting_id = ? AND extra_text IS NOT NULL AND extra_text != ''", votingID).Find(&textResponses)

	textsMap := make(map[int][]string)
	for _, tr := range textResponses {
		textsMap[tr.OptionIdx] = append(textsMap[tr.OptionIdx], tr.ExtraText)
	}

	var total int
	countMap := make(map[int]int)
	for _, c := range counts {
		countMap[c.OptionIdx] = c.Count
		total += c.Count
	}

	return c.JSON(fiber.Map{
		"voting_id":     votingID,
		"option_counts": countMap,
		"extra_texts":   textsMap,
		"total":         total,
	})
}

func (p *Plugin) listEventRecords(c *fiber.Ctx) error {
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var records []models.EventRecord
	if err := p.db.Where("school_id = ?", schoolID).Order("created_at desc").Find(&records).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list event records"})
	}

	return c.JSON(records)
}

func (p *Plugin) createEventRecord(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var record models.EventRecord
	if err := c.BodyParser(&record); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	record.SchoolID = schoolID
	record.AuthorID = userID

	if err := p.db.Create(&record).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create event record"})
	}

	// Index for RAG
	if p.ragSvc != nil {
		go p.ragSvc.IndexDocument(schoolID, "event", record.ID, "[행사] "+record.Title, "행사 유형: "+record.EventType, "")
	}

	return c.Status(fiber.StatusCreated).JSON(record)
}
