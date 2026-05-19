import { buildApp } from "./app.js";

async function main() {
  const app = await buildApp();
  await app.ready();
  await app.listen({ port: app.config.PORT, host: "0.0.0.0" });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
