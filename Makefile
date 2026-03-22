.PHONY: dev build package clean

# Install all dependencies
install:
	cd server && npm install
	cd dashboard && npm install

# Dev mode: watch server + dashboard
dev:
	cd server && npm run dev &
	cd dashboard && npm run dev &

# Build everything
build:
	cd server && npm run build
	cd dashboard && npm run build
	cp -r dashboard/dist server/dist/public

# Package as .plugin
package: build
	cd .. && zip -r claude-devtools.plugin claude-devtools/ \
		-x "claude-devtools/server/node_modules/*" \
		-x "claude-devtools/dashboard/node_modules/*" \
		-x "claude-devtools/server/src/*" \
		-x "claude-devtools/dashboard/src/*" \
		-x "claude-devtools/.git/*"

clean:
	rm -rf server/dist dashboard/dist
