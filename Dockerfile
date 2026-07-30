FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public
COPY admin ./admin

ENV NODE_ENV=production
EXPOSE 3000

# node:*-bookworm-slim ships a non-root "node" user (uid/gid 1000), matching
# a typical single-user host — keeps files written to the uploads bind mount
# owned by you instead of root.
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:3000/login', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
