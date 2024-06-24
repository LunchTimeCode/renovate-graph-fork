@_list:
    just --choose

install:
    bun install
    bun install --frozen-lockfile
    npm install
    npm ci

# Perform all verifications (compile, test, lint, etc.)
verify: lint

build:
    bun run build

lint:
    bun run lint

fmt:
    bun run format

run:
    bun run build
