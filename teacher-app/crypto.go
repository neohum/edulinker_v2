package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"io"
	"os"
	"path/filepath"
)

var localCryptoKey []byte

// InitCryptoKey loads the local AES-256 key from AppData, generating a new one if it doesn't exist.
// This ensures that the local SQLite data remains secure across restarts.
func InitCryptoKey() error {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		appData = filepath.Join(home, ".edulinker")
	}

	keyPath := filepath.Join(appData, "edulinker", "secure.key")

	if err := os.MkdirAll(filepath.Dir(keyPath), 0755); err != nil {
		return err
	}

	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		// Generate 32-byte key for AES-256
		key := make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, key); err != nil {
			return err
		}
		if err := os.WriteFile(keyPath, key, 0600); err != nil {
			return err
		}
		localCryptoKey = key
	} else {
		key, err := os.ReadFile(keyPath)
		if err != nil {
			return err
		}
		localCryptoKey = key
	}
	return nil
}

// Encrypt encrypts a plaintext string using AES-256-GCM and returns a Base64-encoded string.
// If the input is empty or the key is not initialized, it returns the input.
func Encrypt(plaintext string) string {
	if plaintext == "" || len(localCryptoKey) != 32 {
		return plaintext
	}

	block, err := aes.NewCipher(localCryptoKey)
	if err != nil {
		return plaintext
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return plaintext
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return plaintext
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext)
}

// Decrypt decrypts a Base64-encoded AES-256-GCM string into plaintext.
// If the input is empty or the key is not initialized or decoding fails, it returns the input.
func Decrypt(ciphertextBase64 string) string {
	if ciphertextBase64 == "" || len(localCryptoKey) != 32 {
		return ciphertextBase64
	}

	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextBase64)
	if err != nil {
		// Possibly not encrypted yet (legacy row)
		return ciphertextBase64
	}

	block, err := aes.NewCipher(localCryptoKey)
	if err != nil {
		return ciphertextBase64
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ciphertextBase64
	}

	if len(ciphertext) < gcm.NonceSize() {
		// Malformed ciphertext or legacy plain text that happened to base64 decode
		return ciphertextBase64
	}

	nonce, ciphertextPart := ciphertext[:gcm.NonceSize()], ciphertext[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertextPart, nil)
	if err != nil {
		// Failed to decrypt (legacy row or corrupted)
		return ciphertextBase64
	}

	return string(plaintext)
}
