# Multi-stage build for React/Vite Single Page Applications (served via Nginx)

# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Production Stage ---
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom Nginx configuration to support SPA routing (redirect all fallback routes to index.html)
RUN echo $'\n\
server {\n\
    listen 80;\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html index.htm;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location /health {\n\
        access_log off;\n\
        add_header Content-Type text/plain;\n\
        return 200 "healthy\\n";\n\
    }\n\
}' > /etc/nginx/conf.d/default.conf

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

EXPOSE 80
ENV PORT=80

CMD ["nginx", "-g", "daemon off;"]
