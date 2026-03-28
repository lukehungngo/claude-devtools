SHELL := /bin/bash
ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

.PHONY: dev dev-debug build package clean install lint test typecheck

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

clean:
	rm -rf $(ROOT_DIR)/server/dist $(ROOT_DIR)/dashboard/dist $(ROOT_DIR)/server/debug.sqlite $(ROOT_DIR)/server/debug.sqlite-wal $(ROOT_DIR)/server/debug.sqlite-shm
