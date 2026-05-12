# Multi-stage build: compile TS in builder, run lean in runtime.

# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Dependencies first (better layer caching when source changes but deps don't)
COPY package.json package-lock.json ./
RUN npm ci

# Source + build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies from node_modules — only production deps survive
RUN npm prune --omit=dev

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Run as non-root for safety. node:alpine has a 'node' user by default.
USER node

# Copy only what's needed to run
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Lightweight healthcheck — hits our own /health endpoint
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
