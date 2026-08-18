import { Pool } from "pg";
import { loadConfig } from "./config.js";
import {
  createCloudflareAccessVerifier,
  createKuruAuthVerifier
} from "./auth.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "kurubase-api"
});

const kuruAuthVerifier = createKuruAuthVerifier(config);
const cloudflareVerifier =
  config.cloudflareAccessRequired && config.cloudflareTeamDomain && config.cloudflareAudience
    ? createCloudflareAccessVerifier(config.cloudflareTeamDomain, config.cloudflareAudience)
    : undefined;

const app = await buildApp({
  config,
  pool,
  kuruAuthVerifier,
  ...(cloudflareVerifier ? { cloudflareVerifier } : {})
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
