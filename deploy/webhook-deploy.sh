#!/usr/bin/env bash
# Script chamado pelo endpoint /api/public/deploy-hook após push no main.
# Faz: git pull → bun install → build → pm2 restart.
# Log: /var/log/evopay-deploy.log (ou stdout se não puder escrever).

set -eo pipefail

REPO_DIR="${REPO_DIR:-/var/www/evopay/new-repo}"
PM2_NAME="${PM2_PROCESS_NAME:-evopay}"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG_FILE="${DEPLOY_LOG:-/var/log/evopay-deploy.log}"

# Garante que o log é gravável; se não, joga em /tmp.
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/evopay-deploy.log"

log() { echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"; }

log "==== deploy start (sha=${DEPLOY_COMMIT_SHA:-?}) ===="
cd "$REPO_DIR" || { log "FAIL: dir $REPO_DIR não existe"; exit 1; }

{
  git fetch origin "$BRANCH" && \
  git reset --hard "origin/$BRANCH" && \
  bun install && \
  bun run build:vps && \
  pm2 restart "$PM2_NAME" --update-env
} >> "$LOG_FILE" 2>&1

log "==== deploy done ===="
