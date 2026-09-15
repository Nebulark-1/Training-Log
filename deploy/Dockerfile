# Chaos Coaching — one small image, no build step.
#
# Node 22 has SQLite built in, so there is nothing to compile and no native
# dependency to break between machines. The image holds the code; the data
# lives on a volume mounted at /data and survives every redeploy.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY seed ./seed

# Runs as a normal user. The volume is chowned by compose on first start.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV HOST=0.0.0.0 PORT=4317 DB_PATH=/data/ledger.db
EXPOSE 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4317/healthz >/dev/null || exit 1

CMD ["node", "--experimental-sqlite", "--no-warnings", "server/index.js"]
