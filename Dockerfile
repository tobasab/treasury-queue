# Build the React application.
FROM node:24-bookworm-slim AS frontend

WORKDIR /build/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Run Express and serve the React build.
FROM node:24-bookworm-slim AS production

ENV NODE_ENV=production

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=frontend /build/client/dist /app/client/dist

USER node

EXPOSE 3000

CMD ["node", "index.js"]