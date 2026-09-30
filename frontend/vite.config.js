import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// M1 fix: proxy target env-overridable for occupied :8080 (e.g. EnterpriseDB httpd on QA box).
// Usage: VITE_API_TARGET=http://localhost:8081 npx vite --port 5173
// Falls back to BACKEND_PORT / PORT, then 8080 default (Cloud Run provides $PORT for backend).
const apiTarget =
  process.env.VITE_API_TARGET ||
  `http://localhost:${process.env.BACKEND_PORT || process.env.PORT || 8080}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": apiTarget }
  }
});
