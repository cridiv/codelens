package store

// Store defines an interface for key-value persistence.
type Store interface {
	Get(key string) (string, error)
	Set(key string, val string) error
}

// MemoryStore implements the Store interface.
type MemoryStore struct {
	data map[string]string
}

// NewMemoryStore constructs a new MemoryStore.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		data: make(map[string]string),
	}
}

// Get retrieves a value by key.
func (m *MemoryStore) Get(key string) (string, error) {
	return m.data[key], nil
}

// Set stores a key-value pair.
func (m *MemoryStore) Set(key string, val string) error {
	m.data[key] = val
	return nil
}
