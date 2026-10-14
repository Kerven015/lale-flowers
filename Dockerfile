# Lale Gülleri: one image with the website and the shop server.
# Build + run everything with:  docker compose up -d --build   (see DOCKER.md)

# If npmjs.org is slow or blocked, build with:
#   docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org

# ---- 1. build the website (React + Vite -> static files in /app/dist) --------
FROM node:22-alpine AS website
ARG NPM_REGISTRY
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# "install" (not "ci") so a package added to package.json is fetched even if
# package-lock.json was not updated yet
RUN npm install --registry="$NPM_REGISTRY" --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- 2. the shop server (also serves the built website) ----------------------
FROM node:22-alpine
ARG NPM_REGISTRY
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=../dist \
    UPLOAD_DIR=uploads

WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev --registry="$NPM_REGISTRY" --no-audit --no-fund
COPY server/ ./

# the first-start script adds the 16 original flowers from this file
COPY package.json /app/package.json
COPY src/data/catalog.js /app/src/data/catalog.js
COPY --from=website /app/dist /app/dist

# photos folder belongs to the unprivileged "node" user the server runs as;
# the website files must be readable by it whatever permissions they had
RUN mkdir -p uploads && chown -R node:node uploads && chmod -R a+rX /app/dist
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# every start: update the tables if needed, add the 16 flowers if the shop is
# empty (only the very first time), then run the server
CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed.js && exec node src/index.js"]
