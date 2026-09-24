FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/scripts ./scripts
COPY --chown=node:node backend/atlas-vector-index.json ./atlas-vector-index.json

USER node
EXPOSE 5000
HEALTHCHECK --interval=20s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
