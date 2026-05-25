// OPSP-18: MCP HTTP 어댑터 — `:3001/mcp` 엔드포인트.
// Claude Code 등록: claude mcp add opspilot --url http://localhost:3001/mcp
// stateless 모드 — 매 요청마다 새 server/transport(단순함 우선, 세션 공유 X).
import type { FastifyPluginAsync } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createMcpServer } from "../mcp/server.js";
import { mcpLog } from "../mcp/log.js";

const mcpRoute: FastifyPluginAsync = async (fastify) => {
  fastify.all("/mcp", async (request, reply) => {
    reply.hijack();
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: false,
    });
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (e) {
      fastify.log.error({ err: e }, "MCP 요청 처리 실패");
      mcpLog.error(`MCP 요청 실패: ${(e as Error).message}`);
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(JSON.stringify({ error: "MCP internal error" }));
      } else {
        reply.raw.end();
      }
    }
  });
};

export default mcpRoute;
