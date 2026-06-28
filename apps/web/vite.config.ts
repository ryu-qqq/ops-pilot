import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 프록시 대상 기본 :3001. 격리 검증 스택 등에선 OPS_API_TARGET 로 override.
const apiTarget = process.env.OPS_API_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 백엔드(Fastify) 프록시 — 프론트는 /api 로만 호출.
    proxy: { "/api": apiTarget },
  },
  preview: {
    host: true,
    port: 5173,
    proxy: { "/api": apiTarget },
  },
});
