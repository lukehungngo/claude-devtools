SHELL := /bin/bash
ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

.PHONY: dev dev-debug build package clean install lint test test-e2e typecheck bench bench-server bench-dashboard bench-all

# Install all dependencies
install:
	cd $(ROOT_DIR) && pnpm install
	cd $(ROOT_DIR)/server && pnpm install
	cd $(ROOT_DIR)/dashboard && pnpm install

# Lint
lint:
	cd $(ROOT_DIR) && pnpm lint

# Dev mode: watch server + dashboard
dev:
	trap 'kill 0' EXIT; \
	(cd $(ROOT_DIR)/server && pnpm run dev) & \
	(cd $(ROOT_DIR)/dashboard && pnpm run dev) & \
	wait

# Dev mode with debug DB (SQLite lifecycle tracing)
dev-debug:
	trap 'kill 0' EXIT; \
	(cd $(ROOT_DIR)/server && NODE_ENV=development pnpm run dev) & \
	(cd $(ROOT_DIR)/dashboard && pnpm run dev) & \
	wait

# Run all tests
test:
	cd $(ROOT_DIR)/server && pnpm test
	cd $(ROOT_DIR)/dashboard && pnpm test

# Run E2E tests (requires dev server running or auto-starts via playwright config)
test-e2e:
	cd $(ROOT_DIR)/dashboard && pnpm test:e2e

# TypeScript type checking
typecheck:
	cd $(ROOT_DIR)/server && npx tsc --noEmit
	cd $(ROOT_DIR)/dashboard && npx tsc --noEmit

# Build everything
build:
	cd $(ROOT_DIR)/server && pnpm run build
	cd $(ROOT_DIR)/dashboard && pnpm run build
	cp -r $(ROOT_DIR)/dashboard/dist $(ROOT_DIR)/server/dist/public

# Package as .plugin
package: build
	cd $(ROOT_DIR)/.. && zip -r claude-devtools.plugin claude-devtools/ \
		-x "claude-devtools/server/node_modules/*" \
		-x "claude-devtools/dashboard/node_modules/*" \
		-x "claude-devtools/server/src/*" \
		-x "claude-devtools/dashboard/src/*" \
		-x "claude-devtools/.git/*"

# Run benchmarks
bench-server:
	cd $(ROOT_DIR)/server && pnpm test:bench --run

bench-dashboard:
	cd $(ROOT_DIR)/dashboard && pnpm test:bench --run

bench: bench-server bench-dashboard

bench-all: bench test-e2e

clean:
	rm -rf $(ROOT_DIR)/server/dist $(ROOT_DIR)/dashboard/dist $(ROOT_DIR)/server/debug.sqlite $(ROOT_DIR)/server/debug.sqlite-wal $(ROOT_DIR)/server/debug.sqlite-shm
