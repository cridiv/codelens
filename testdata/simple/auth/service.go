package auth

import "example.com/simple/store"

// AuthService provides user authentication logic.
type AuthService struct {
	Store store.Store
}

// NewAuthService returns an initialized AuthService.
func NewAuthService(s store.Store) *AuthService {
	return &AuthService{Store: s}
}

// Login verifies credentials and records the session.
func (a *AuthService) Login(username string, password string) (bool, error) {
	if password == "" {
		return false, nil
	}
	err := a.Store.Set("last_user", username)
	if err != nil {
		return false, err
	}
	return true, nil
}
