import { Pool } from "pg";
import { loadConfig } from "./config.js";
import { createIdentityProvider, PostgresPrincipalResolver } from "./auth.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "kurubase-api"
});

const principalResolver = new PostgresPrincipalResolver(pool);
const identityProvider = createIdentityProvider(config.identity, principalResolver);

const app = await buildApp({
  config,
  pool,
  identityProvider
});

const close = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGTERM", () => void close("SIGTERM"));
process.on("SIGINT", () => void close("SIGINT"));

await app.listen({ host: config.host, port: config.port });
