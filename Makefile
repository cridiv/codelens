.PHONY: build ui run clean test

ui:
	cd ui && npm install && npm run build

build: ui
	go build -o codelens ./cmd/codelens

run:
	go run ./cmd/codelens .

test:
	go test ./...
	cd ui && npm test

clean:
	rm -rf codelens codeatlas ui/dist .codelens-cache .codeatlas-cache
