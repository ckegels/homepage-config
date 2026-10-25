FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3100 \
    CONFIG_DIR=/app/config \
    DATA_DIR=/data

WORKDIR /opt/homepage-config
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
COPY data/widget-catalog.json ./data/widget-catalog.json

RUN mkdir -p /data /app/config && chown node:node /data /app/config
# Runs as uid 1000 by default; override with `user:` in compose to match the
# owner of your Homepage config folder.
USER node
VOLUME ["/data"]
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:3100/healthz || exit 1

CMD ["node", "server/index.js"]
