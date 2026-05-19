import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 백엔드(Fastify) 프록시 — 프론트는 /api 로만 호출.
    proxy: { "/api": "http://localhost:3001" },
  },
});
