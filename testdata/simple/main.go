package main

import (
	"fmt"

	"example.com/simple/auth"
	"example.com/simple/store"
)

func main() {
	st := store.NewMemoryStore()
	svc := auth.NewAuthService(st)
	ok, _ := svc.Login("alice", "secret")
	fmt.Println("Login result:", ok)
}
