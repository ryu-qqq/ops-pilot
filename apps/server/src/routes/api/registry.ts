import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetSchema, assetVersionSchema } from "@opspilot/shared-types";
import { scanRepo } from "../../domains/registry/scanner.js";
import { assetExists, listAssets, listVersions, saveScan } from "../../domains/registry/repository.js";

const versionSummarySchema = assetVersionSchema.omit({ content: true });
const errorSchema = z.object({ error: z.string(), detail: z.string() });

const scanBodySchema = z.object({ repoPath: z.string().min(1) });
const scanResponseSchema = z.object({
  repoPath: z.string(),
  scannedAssets: z.number().int(),
  scannedVersions: z.number().int(),
  saved: z.object({ assets: z.number().int(), versions: z.number().int() }),
});

const registry: FastifyPluginAsyncZod = async (fastify) => {
  // 레포의 .claude/ 스캔 → 멱등 적재
  fastify.post(
    "/registry/scan",
    { schema: { body: scanBodySchema, response: { 200: scanResponseSchema, 400: errorSchema } } },
    async (req, reply) => {
      let scanned;
      try {
        scanned = scanRepo(req.body.repoPath);
      } catch (e) {
        return reply.status(400).send({ error: "ScanError", detail: (e as Error).message });
      }
      const saved = saveScan(scanned);
      return {
        repoPath: req.body.repoPath,
        scannedAssets: scanned.length,
        scannedVersions: scanned.reduce((n, a) => n + a.versions.length, 0),
        saved,
      };
    },
  );

  fastify.get(
    "/registry/assets",
    { schema: { response: { 200: z.object({ assets: z.array(assetSchema) }) } } },
    async () => ({ assets: listAssets() }),
  );

  fastify.get(
    "/registry/assets/:id/versions",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ versions: z.array(versionSummarySchema) }), 404: errorSchema },
      },
    },
    async (req, reply) => {
      if (!assetExists(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "asset not found" });
      }
      return { versions: listVersions(req.params.id) };
    },
  );
};

export default registry;
