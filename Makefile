.PHONY: build ui run clean test

ui:
	cd ui && npm install && npm run build

build: ui
	go build -o codeatlas ./cmd/codeatlas

run:
	go run ./cmd/codeatlas .

test:
	go test ./...
	cd ui && npm test

clean:
	rm -rf codeatlas ui/dist .codeatlas-cache
