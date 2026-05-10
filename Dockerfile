###############################################################################
# RoomEase — Production Dockerfile (Multi-Stage)
# Image: ~50 MB  |  Non-root  |  Alpine  |  Healthcheck
###############################################################################

# ── Stage 1: Install production dependencies ─────────────────────────────
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Stage 2: Production runtime ──────────────────────────────────────────
FROM node:18-alpine AS runtime

# Security: create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S roomease -u 1001 -G nodejs

WORKDIR /app

# Copy only what we need
COPY --from=deps --chown=roomease:nodejs /app/node_modules ./node_modules
COPY --chown=roomease:nodejs package.json ./
COPY --chown=roomease:nodejs app.js ./
COPY --chown=roomease:nodejs models ./models
COPY --chown=roomease:nodejs controllers ./controllers
COPY --chown=roomease:nodejs routes ./routes
COPY --chown=roomease:nodejs public ./public

# Switch to non-root
USER roomease

# Expose application port
EXPOSE 3000

# Docker-native health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# Start the application
CMD ["node", "app.js"]