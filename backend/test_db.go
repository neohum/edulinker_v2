package main

import (
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/edulinker/backend/internal/config"
	"github.com/edulinker/backend/internal/database"
	"github.com/edulinker/backend/internal/database/models"
)

var koreanFeedbacks = []string{
	"글자의 짜임을 알고 자음과 모음을 구별하여 정확하게 읽고 쓸 수 있습니다.",
	"자신의 생각이나 느낌을 문장으로 바르게 표현하며 쓰기 활동에 적극적으로 참여합니다.",
	"그림책을 읽고 일어난 일의 순서에 맞게 내용을 잘 말할 수 있습니다.",
	"바른 자세로 다른 사람의 말을 주의 깊게 듣고 자신의 의견을 또렷하게 말합니다.",
	"받침이 있는 글자를 소리 내어 정확하게 읽고 의미를 잘 이해합니다.",
}

var mathFeedbacks = []string{
	"1부터 100까지의 수의 순서를 이해하고, 수의 크기를 능숙하게 비교할 수 있습니다.",
	"가르기와 모으기 활동을 통해 덧셈과 뺄셈의 기초 원리를 잘 이해하고 계산합니다.",
	"여러 가지 물건을 관찰하고 모양에 따라 기준을 정해 바르게 분류할 수 있습니다.",
	"시계를 보고 '몇 시', '몇 시 30분'을 정확하게 읽을 수 있습니다.",
	"주어진 패턴의 규칙을 찾아 다음에 올 모양이나 수를 정확하게 예측합니다.",
}

var rightLifeFeedbacks = []string{
	"인사말을 상황에 맞게 바르게 사용하며 웃어른께 예의 바르게 행동합니다.",
	"자신의 물건을 스스로 정리정돈하고 교실을 깨끗하게 유지하려는 태도가 우수합니다.",
	"식사 예절을 잘 지키며 편식하지 않고 골고루 먹는 습관이 형성되어 있습니다.",
	"복도나 계단에서 뛰지 않고 우측통행을 하며 교통 안전 규칙을 잘 지킵니다.",
}

var wiseLifeFeedbacks = []string{
	"봄, 여름, 가을, 겨울의 계절 변화에 따른 생활 모습의 특징을 잘 찾아냅니다.",
	"우리 동네의 주요 장소와 역할을 이해하고 그림 지도로 바르게 표현합니다.",
	"주변의 동식물에 관심을 가지고 관찰하며 생명을 소중히 여기는 마음이 돋보입니다.",
	"가족의 형태와 역할을 이해하고 가족을 위해 자신이 할 수 있는 일을 찾아 실천합니다.",
}

var joyfulLifeFeedbacks = []string{
	"음악의 박자와 리듬을 느끼며 즐겁게 노래 부르고 악기 연주 활동에 참여합니다.",
	"주변에서 볼 수 있는 재료를 활용하여 자신의 생각과 느낌을 창의적으로 표현합니다.",
	"다양한 신체 활동에 즐겁게 참여하며 규칙을 지켜 친구들과 사이좋게 놀이합니다.",
	"종이접기, 그리기 등 조형 활동에 흥미가 많으며 완성도 높은 결과물을 만듭니다.",
}

var counselingContents = []string{
	"학교 생활에 매우 잘 적응하고 있으며, 친구들과도 양보하며 사이좋게 지냅니다. 수업 시간에 집중력이 높고 발표도 적극적으로 합니다.",
	"초기에는 낯선 환경에 다소 긴장하는 모습을 보였으나, 현재는 밝은 모습으로 등교하며 특히 미술 활동에 큰 흥미를 보이고 있습니다.",
	"기본 생활 습관이 잘 형성되어 있어 스스로 정리정돈을 잘합니다. 가끔 또래와 사소한 갈등이 있으나 대화로 원만하게 해결하는 편입니다.",
	"학습에 대한 호기심이 많고 질문을 자주 하며 적극적인 태도를 보입니다. 친구들을 잘 도와주어 학급에서 신뢰를 얻고 있습니다.",
	"다소 조용하고 내성적인 편이나, 맡은 바 책임을 다하고 묵묵히 자신의 할 일을 수행합니다. 칭찬과 격려를 통해 자신감이 더 커지고 있습니다.",
}

func main() {
	rand.Seed(time.Now().UnixNano())

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}

	var students []models.User
	if err := db.Where("role = ?", "student").Find(&students).Error; err != nil {
		log.Fatalf("Failed to fetch students: %v", err)
	}

	if len(students) == 0 {
		log.Println("No students found in the database. Cannot insert data.")
		return
	}

	var teacher models.User
	if err := db.Where("role = ?", "teacher").First(&teacher).Error; err != nil {
		log.Fatalf("No teachers found in the database. Cannot assign created_by.")
	}

	log.Printf("Found %d students. Starting mock data insertion...\n", len(students))

	subjects := []struct {
		Name      string
		Feedbacks []string
	}{
		{"국어", koreanFeedbacks},
		{"수학", mathFeedbacks},
		{"바른 생활", rightLifeFeedbacks},
		{"슬기로운 생활", wiseLifeFeedbacks},
		{"즐거운 생활", joyfulLifeFeedbacks},
	}

	counselingCount := 0
	evaluationCount := 0

	for _, student := range students {
		// 1. Insert Counseling Record
		counseling := models.StudentCounseling{
			SchoolID:       student.SchoolID,
			StudentID:      student.ID,
			TeacherID:      teacher.ID,
			Category:       "academic",
			Content:        counselingContents[rand.Intn(len(counselingContents))],
			CounselingDate: time.Now().AddDate(0, 0, -rand.Intn(30)), // random past 30 days
		}
		if err := db.Create(&counseling).Error; err == nil {
			counselingCount++
		}

		// 2. Insert Evaluation Records for each subject
		for _, subject := range subjects {
			score := float64(80 + rand.Intn(21)) // 80 to 100
			evaluation := models.EvaluationRecord{
				SchoolID:       student.SchoolID,
				TeacherID:      teacher.ID,
				StudentID:      student.ID,
				Subject:        subject.Name,
				EvaluationType: "수행평가",
				Score:          score,
				Feedback:       subject.Feedbacks[rand.Intn(len(subject.Feedbacks))],
			}
			if err := db.Create(&evaluation).Error; err == nil {
				evaluationCount++
			}
		}
	}

	fmt.Printf("✅ Seeding completed!\n")
	fmt.Printf("- Inserted %d StudentCounseling records.\n", counselingCount)
	fmt.Printf("- Inserted %d EvaluationRecord records.\n", evaluationCount)
}
