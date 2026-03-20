package auth

import (
	"errors"
	"time"

	"github.com/edulinker/backend/internal/database/models"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrInvalidToken = errors.New("invalid or expired token")
	ErrInvalidCreds = errors.New("invalid credentials")
)

// Claims contains JWT token claims.
type Claims struct {
	UserID   uuid.UUID   `json:"user_id"`
	SchoolID uuid.UUID   `json:"school_id"`
	Role     models.Role `json:"role"`
	jwt.RegisteredClaims
}

// Service handles JWT token operations.
type Service struct {
	secret          []byte
	expiryHours     int
	refreshExpiryHr int
}

// NewService creates a new auth service.
func NewService(secret string, expiryHours, refreshExpiryHr int) *Service {
	return &Service{
		secret:          []byte(secret),
		expiryHours:     expiryHours,
		refreshExpiryHr: refreshExpiryHr,
	}
}

// GenerateToken creates a new JWT access token.
func (s *Service) GenerateToken(user *models.User) (string, error) {
	claims := &Claims{
		UserID:   user.ID,
		SchoolID: user.SchoolID,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(s.expiryHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

// GenerateRefreshToken creates a longer-lived refresh token.
func (s *Service) GenerateRefreshToken(user *models.User) (string, error) {
	claims := &Claims{
		UserID:   user.ID,
		SchoolID: user.SchoolID,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(s.refreshExpiryHr) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

// ValidateToken parses and validates a JWT token string.
func (s *Service) ValidateToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}
