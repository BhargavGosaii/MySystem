# Multi-stage build for Node.js Applications

# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build --if-present

# --- Production Stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist --keep-directory-structure --if-present
COPY --from=builder /app/build ./build --keep-directory-structure --if-present
COPY --from=builder /app/server.js ./server.js --if-present
COPY --from=builder /app/index.js ./index.js --if-present

# Set safe, non-root user
USER node

# Health check setup
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => r.status === 200 ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 3000
ENV PORT=3000

CMD ["node", "dist/index.js"]
