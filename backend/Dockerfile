# KisaanMitra single-service Cloud Run (API + frontend). Build context = repo root.
# H3 fix: multi-stage builds frontend/dist INSIDE Docker so `gcloud run deploy --source .`
# works even though frontend/dist/ is gitignored. Cache-friendly layer order.

# ---- Stage 1: build frontend ----
FROM node:20-slim AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend install
COPY frontend ./frontend
RUN npm --prefix frontend run build

# ---- Stage 2: backend + prebuilt frontend ----
FROM node:20-slim
WORKDIR /app
# Backend + prebuilt frontend (single Cloud Run service)
COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev
COPY backend ./backend
COPY --from=frontend-build /build/frontend/dist ./frontend/dist
ENV PORT=8080 NODE_ENV=production
WORKDIR /app/backend
CMD ["node", "server.js"]
