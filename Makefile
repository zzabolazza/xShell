# xShell — Electron desktop app + Node launcher for xLauncher.
# Usage: make -C xShell install | make test | make uninstall

.PHONY: help test install uninstall normalize-artifact-names

.DEFAULT_GOAL := help

ifeq ($(OS),Windows_NT)
    ifneq ($(strip $(HOME)),)
        USER_HOME_RAW := $(HOME)
    else
        USER_HOME_RAW := $(USERPROFILE)
    endif
    USER_HOME := $(shell cygpath -u "$(USER_HOME_RAW)" 2>/dev/null)
    ifeq ($(strip $(USER_HOME)),)
        $(error Cannot resolve Windows home directory. Run Make using Git Bash with cygpath available)
    endif
else
    USER_HOME := $(HOME)
endif

PREFIX ?= $(USER_HOME)/.xTools
BIN := xShell
# Install tree uses lowercase path segment for compatibility with other products' lib/ layout.
LIB_NAME := xshell
PC_SRC := platforms/pc
INSTALL_LIB := $(PREFIX)/lib/$(LIB_NAME)
INSTALL_PC := $(INSTALL_LIB)/pc
INSTALL_BIN := $(PREFIX)/bin/$(BIN)
INSTALL_DESC := $(PREFIX)/bin/$(BIN).desc

help:
	@echo "Targets: test, install, uninstall"
	@echo "PREFIX defaults to $(USER_HOME)/.xTools"
	@echo "BIN=$(BIN)  lib=$(INSTALL_LIB)"

test:
	node --test scripts/listen-addr.test.js

install:
	command -v node >/dev/null 2>&1 || { echo "error: node is required for install" >&2; exit 1; }
	command -v npm >/dev/null 2>&1 || { echo "error: npm is required for install" >&2; exit 1; }
	@test -f "$(BIN).desc" || { echo "error: missing $(BIN).desc" >&2; exit 1; }
	@test -f "$(PC_SRC)/package.json" || { echo "error: missing $(PC_SRC)/package.json" >&2; exit 1; }
	@test -f "$(PC_SRC)/package-lock.json" || { echo "error: missing $(PC_SRC)/package-lock.json (needed for npm ci)" >&2; exit 1; }
	install -d "$(PREFIX)/bin"
	$(MAKE) --no-print-directory normalize-artifact-names NORMALIZE_DIR="$(PREFIX)/bin"
	rm -rf "$(INSTALL_LIB)"
	install -d "$(INSTALL_PC)"
	rsync -a --delete "$(PC_SRC)/" "$(INSTALL_PC)/" \
		--exclude 'node_modules' --exclude '.dev-app' --exclude 'dist' \
		--exclude '.DS_Store'
	install -m 0644 scripts/listen-addr.js "$(INSTALL_LIB)/listen-addr.js"
	install -m 0644 scripts/xshell-launch.js "$(INSTALL_LIB)/xshell-launch.js"
	cd "$(INSTALL_PC)" && npm ci
	@if [ "$$(uname -s 2>/dev/null)" = "Darwin" ]; then \
		cd "$(INSTALL_PC)" && node scripts/prepare-macos-dev.js; \
	fi
	@{ printf '%s\n' '#!/bin/sh' \
		'ROOT="$(PREFIX)"' \
		'exec node "$$ROOT/lib/$(LIB_NAME)/xshell-launch.js" "$$@"'; } > "$(INSTALL_BIN)"
	chmod 755 "$(INSTALL_BIN)"
	install -m 0644 "$(BIN).desc" "$(INSTALL_DESC)"
	@echo "Installed $(BIN) for xLauncher"
	@echo "Binary: $(INSTALL_BIN)"
	@echo "App:    $(INSTALL_PC)"

uninstall:
	rm -rf "$(INSTALL_LIB)"
	rm -f "$(INSTALL_BIN)" "$(INSTALL_DESC)"
	rm -f "$(PREFIX)/bin/$(BIN).exe" "$(PREFIX)/bin/xshell" "$(PREFIX)/bin/xshell.desc"
	@echo "Uninstalled from: $(PREFIX)/bin"

LEGACY_BIN := xshell
CANONICAL_BIN := $(BIN)

# Normalize legacy filenames explicitly: overwriting a file on macOS does not
# necessarily update the capitalization of its existing directory entry.
normalize-artifact-names:
	@set -e; for dir in "$(NORMALIZE_DIR)"; do \
		[ -n "$$dir" ] && [ -d "$$dir" ] || continue; \
		for file in "$$dir"/*; do \
			[ -f "$$file" ] || continue; name=$${file##*/}; \
			case "$$name" in $(LEGACY_BIN)|$(LEGACY_BIN)-*|$(LEGACY_BIN).exe|$(LEGACY_BIN).desc|$(LEGACY_BIN).exe.desc) ;; *) continue ;; esac; \
			target="$$dir/$(CANONICAL_BIN)$${name#$(LEGACY_BIN)}"; \
			if [ -e "$$target" ] && [ ! "$$file" -ef "$$target" ]; then rm -f "$$file"; \
			else mv "$$file" "$$file.naming-tmp"; mv "$$file.naming-tmp" "$$target"; fi; \
		done; \
	done
