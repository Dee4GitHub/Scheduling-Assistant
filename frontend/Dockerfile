# Multi-stage build: install + build under Node 22, then ship the
# Next.js standalone output in a slim runtime image. The standalone
# bundle pulls in only the server runtime and the route closures, so
# node_modules doesn't travel into production.

# Build-time arg: the public API base URL gets inlined into the client
# bundle by Next (NEXT_PUBLIC_* values are read at build time, not at
# runtime). docker-compose passes the in-network backend URL so the
# browser-side fetch points at the right host.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000

# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Dependencies first (better layer caching when source changes but deps don't)
COPY package.json package-lock.json ./
RUN npm ci

# Source + build
COPY tsconfig.json next.config.ts next-env.d.ts ./
COPY src ./src
COPY public ./public

# Re-declare the ARG inside this stage so it's visible to `next build`.
# Without the explicit ENV line, NEXT_PUBLIC_API_BASE_URL would be
# undefined inside the RUN.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user — node:alpine ships one out of the box.
USER node

# Copy the standalone bundle Next produced. The .next/static and
# public folders are not part of the bundle by design, so they have to
# be copied alongside.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

EXPOSE 3000

# server.js is the entry the standalone bundle creates.
CMD ["node", "server.js"]
