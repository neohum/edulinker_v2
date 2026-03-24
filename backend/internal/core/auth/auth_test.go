package auth

import (
	"testing"
	"time"

	"github.com/edulinker/backend/internal/database/models"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func testUser() *models.User {
	return &models.User{
		ID:       uuid.New(),
		SchoolID: uuid.New(),
		Role:     models.RoleTeacher,
		Name:     "TestUser",
	}
}

func TestNewService(t *testing.T) {
	svc := NewService("secret", 1, 168)
	if svc == nil {
		t.Fatal("NewService returned nil")
	}
	if svc.expiryHours != 1 {
		t.Errorf("expiryHours = %d, want 1", svc.expiryHours)
	}
	if svc.refreshExpiryHr != 168 {
		t.Errorf("refreshExpiryHr = %d, want 168", svc.refreshExpiryHr)
	}
}

func TestGenerateToken_Success(t *testing.T) {
	svc := NewService("test-secret", 1, 168)
	user := testUser()

	token, err := svc.GenerateToken(user)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}
	if token == "" {
		t.Fatal("GenerateToken returned empty token")
	}
}

func TestGenerateToken_Claims(t *testing.T) {
	svc := NewService("test-secret", 1, 168)
	user := testUser()

	tokenStr, _ := svc.GenerateToken(user)
	claims, err := svc.ValidateToken(tokenStr)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}
	if claims.UserID != user.ID {
		t.Errorf("UserID = %v, want %v", claims.UserID, user.ID)
	}
	if claims.SchoolID != user.SchoolID {
		t.Errorf("SchoolID = %v, want %v", claims.SchoolID, user.SchoolID)
	}
	if claims.Role != models.RoleTeacher {
		t.Errorf("Role = %v, want %v", claims.Role, models.RoleTeacher)
	}
	if claims.Subject != user.ID.String() {
		t.Errorf("Subject = %v, want %v", claims.Subject, user.ID.String())
	}
}

func TestGenerateRefreshToken_LongerExpiry(t *testing.T) {
	svc := NewService("test-secret", 1, 168)
	user := testUser()

	accessStr, _ := svc.GenerateToken(user)
	refreshStr, _ := svc.GenerateRefreshToken(user)

	accessClaims, _ := svc.ValidateToken(accessStr)
	refreshClaims, _ := svc.ValidateToken(refreshStr)

	accessExp := accessClaims.ExpiresAt.Time
	refreshExp := refreshClaims.ExpiresAt.Time

	if !refreshExp.After(accessExp) {
		t.Error("Refresh token should expire after access token")
	}
}

func TestValidateToken_Empty(t *testing.T) {
	svc := NewService("test-secret", 1, 168)
	_, err := svc.ValidateToken("")
	if err == nil {
		t.Error("ValidateToken should fail on empty string")
	}
}

func TestValidateToken_Garbage(t *testing.T) {
	svc := NewService("test-secret", 1, 168)
	_, err := svc.ValidateToken("not.a.valid.jwt.token")
	if err == nil {
		t.Error("ValidateToken should fail on garbage input")
	}
}

func TestValidateToken_WrongSecret(t *testing.T) {
	svc1 := NewService("secret-1", 1, 168)
	svc2 := NewService("secret-2", 1, 168)
	user := testUser()

	tokenStr, _ := svc1.GenerateToken(user)
	_, err := svc2.ValidateToken(tokenStr)
	if err == nil {
		t.Error("ValidateToken should fail with wrong secret")
	}
}

func TestValidateToken_Expired(t *testing.T) {
	svc := NewService("test-secret", 1, 168)

	// Manually create an expired token
	claims := &Claims{
		UserID:   uuid.New(),
		SchoolID: uuid.New(),
		Role:     models.RoleTeacher,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString(svc.secret)

	_, err := svc.ValidateToken(tokenStr)
	if err == nil {
		t.Error("ValidateToken should fail on expired token")
	}
}

func TestValidateToken_WrongSigningMethod(t *testing.T) {
	svc := NewService("test-secret", 1, 168)

	// Create token with 'none' signing method
	claims := &Claims{
		UserID:   uuid.New(),
		SchoolID: uuid.New(),
		Role:     models.RoleTeacher,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	tokenStr, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

	_, err := svc.ValidateToken(tokenStr)
	if err == nil {
		t.Error("ValidateToken should reject 'none' signing method")
	}
}

func TestTokenUniqueness(t *testing.T) {
	svc := NewService("test-secret", 1, 168)
	user1 := testUser()
	user2 := testUser()

	t1, _ := svc.GenerateToken(user1)
	t2, _ := svc.GenerateToken(user2)

	if t1 == t2 {
		t.Error("Tokens for different users should differ")
	}
}

func TestAllRoles(t *testing.T) {
	roles := []models.Role{models.RoleAdmin, models.RoleTeacher, models.RoleParent, models.RoleStudent}
	svc := NewService("test-secret", 1, 168)

	for _, role := range roles {
		t.Run(string(role), func(t *testing.T) {
			user := &models.User{
				ID:       uuid.New(),
				SchoolID: uuid.New(),
				Role:     role,
			}
			tokenStr, err := svc.GenerateToken(user)
			if err != nil {
				t.Fatalf("GenerateToken failed for role %s: %v", role, err)
			}
			claims, err := svc.ValidateToken(tokenStr)
			if err != nil {
				t.Fatalf("ValidateToken failed for role %s: %v", role, err)
			}
			if claims.Role != role {
				t.Errorf("Role = %v, want %v", claims.Role, role)
			}
		})
	}
}
