# syntax=docker/dockerfile:1
FROM node:24-bookworm AS builder
RUN corepack enable
WORKDIR /app
# 의존성 레이어 캐시 — 매니페스트 먼저
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/config/package.json packages/config/
RUN corepack pnpm install --frozen-lockfile
# 소스 복사 후 전체 빌드(better-sqlite3 는 install 시 네이티브 컴파일됨)
COPY . .
RUN corepack pnpm -r build

FROM node:24-bookworm-slim AS runtime
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app /app
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3001 5173
ENTRYPOINT ["/entrypoint.sh"]
