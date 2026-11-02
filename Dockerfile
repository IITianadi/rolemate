# Dashboard + API (Express, SQLite, Chromium for PDFs). Not used by the Cloudflare site build.
FROM node:22-bookworm-slim

# System Chromium (+ fonts) for PDF generation
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROMIUM_PATH=/usr/bin/chromium \
    DB_PATH=/data/tailorkit.db

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY web ./web

# /data is where the Railway volume gets mounted
CMD ["node", "--no-warnings", "server/index.js"]
