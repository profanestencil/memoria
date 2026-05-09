# Long-running indexer + HTTP API (GET /memories, POST /memories/:id/image).
# Persist data: mount a volume on /data and set DATA_DIR=/data.
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV DATA_DIR=/data
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8787

CMD ["node", "src/server.js"]
