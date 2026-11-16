# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=80

COPY server.js ./
COPY public ./public

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz > /dev/null || exit 1

CMD ["node", "server.js"]
