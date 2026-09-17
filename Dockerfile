# syntax=docker/dockerfile:1

FROM node:22-bookworm AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
ARG VITE_BASE=/manwha/
ENV VITE_BASE=$VITE_BASE
RUN npm run build

FROM node:22-bookworm AS backend-build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --omit=dev
COPY backend/ ./

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=backend-build /app/backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV PUBLIC_DIR=/app/frontend/dist

RUN mkdir -p /data/covers \
  && chown -R node:node /data /app

USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "backend/server.js"]
