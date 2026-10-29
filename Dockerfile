FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh
COPY --chown=node:node docker/wait-for-db.js ./docker/wait-for-db.js
# Guard against CRLF line endings checked out on Windows - the shell script
# would fail to parse otherwise.
RUN sed -i 's/\r$//' ./docker/entrypoint.sh && chmod +x ./docker/entrypoint.sh
EXPOSE 4000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "const p=process.env.PORT||4000;require('http').get('http://127.0.0.1:'+p+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", "dist/main"]
