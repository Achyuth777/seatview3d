# SeatView3D: app + booking API in one container.
# Build:  docker build -t seatview3d .
# Run:    docker compose up -d   (see docker-compose.yml; needs a .env, copy .env.example)

# ---- build stage: install everything, build the frontend ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: production dependencies + built app + server sources ----
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    SERVE_STATIC=true \
    STATIC_DIR=/app/dist
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# The server imports shared booking/engine code from src/ and runs TypeScript via tsx.
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY tsconfig.json ./
# PGlite fallback directory (unused when DATABASE_URL is set); writable by the unprivileged user.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# exec form: node is PID 1's child under tini (compose `init: true`) and receives SIGTERM for graceful shutdown.
CMD ["node_modules/.bin/tsx", "server/index.ts"]
