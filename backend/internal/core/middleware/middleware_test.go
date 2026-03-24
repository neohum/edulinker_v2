package middleware

import (
	"testing"
)

func TestIsValidEmail(t *testing.T) {
	tests := []struct {
		email string
		valid bool
	}{
		{"test@example.com", true},
		{"user@school.ac.kr", true},
		{"name+tag@domain.com", true},
		{"", false},
		{"not-an-email", false},
		{"@domain.com", false},
		{"user@", false},
	}

	for _, tt := range tests {
		t.Run(tt.email, func(t *testing.T) {
			if got := IsValidEmail(tt.email); got != tt.valid {
				t.Errorf("IsValidEmail(%q) = %v, want %v", tt.email, got, tt.valid)
			}
		})
	}
}

func TestIsValidPhone(t *testing.T) {
	tests := []struct {
		phone string
		valid bool
	}{
		{"010-1234-5678", true},
		{"01012345678", true},
		{"011-123-4567", true},
		{"016-123-4567", true},
		{"02-1234-5678", false},
		{"", false},
		{"12345", false},
		{"abc-defg-hijk", false},
	}

	for _, tt := range tests {
		t.Run(tt.phone, func(t *testing.T) {
			if got := IsValidPhone(tt.phone); got != tt.valid {
				t.Errorf("IsValidPhone(%q) = %v, want %v", tt.phone, got, tt.valid)
			}
		})
	}
}

func TestIsValidUUID(t *testing.T) {
	tests := []struct {
		input string
		valid bool
	}{
		{"550e8400-e29b-41d4-a716-446655440000", true},
		{"00000000-0000-0000-0000-000000000000", true},
		{"", false},
		{"not-a-uuid", false},
		{"550e8400e29b41d4a716446655440000", false}, // no dashes
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := IsValidUUID(tt.input); got != tt.valid {
				t.Errorf("IsValidUUID(%q) = %v, want %v", tt.input, got, tt.valid)
			}
		})
	}
}
