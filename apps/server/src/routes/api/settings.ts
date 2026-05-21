// OPSP-42: 전역 설정 — 지라/노션 인증.
import { settingsUpdateSchema, settingsViewSchema } from "@opspilot/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { getSettingsView, updateSettings } from "../../domains/setting/repository.js";

const settings: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/settings",
    { schema: { response: { 200: settingsViewSchema } } },
    async () => getSettingsView(),
  );

  fastify.put(
    "/settings",
    { schema: { body: settingsUpdateSchema, response: { 200: settingsViewSchema } } },
    async (req) => updateSettings(req.body),
  );
};

export default settings;
