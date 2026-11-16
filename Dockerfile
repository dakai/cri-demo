# syntax=docker/dockerfile:1
FROM nginx:1.27-alpine

# 静态站点：无后端、无构建步骤
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js cri.js data.js /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz > /dev/null || exit 1
