import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

interface DashboardAsset {
  fileName: string;
  contentType: string;
}

const dashboardAssets = new Map<string, DashboardAsset>([
  ["/", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { fileName: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/bootstrap.js", { fileName: "bootstrap.js", contentType: "text/javascript; charset=utf-8" }],
  ["/components.js", { fileName: "components.js", contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { fileName: "styles.css", contentType: "text/css; charset=utf-8" }]
]);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'"
].join("; ");

const defaultDashboardRoot = fileURLToPath(new URL("../../../dashboard", import.meta.url));

/**
 * Serves only the reviewed dashboard build inputs from the API origin. Keeping an
 * explicit allowlist avoids a general-purpose filesystem route and path traversal.
 */
export async function registerDashboardRoutes(
  app: FastifyInstance,
  dashboardRoot = defaultDashboardRoot
): Promise<void> {
  const loadedAssets = new Map<string, { body: Buffer; contentType: string }>();

  for (const [route, asset] of dashboardAssets) {
    loadedAssets.set(route, {
      body: await readFile(resolve(dashboardRoot, asset.fileName)),
      contentType: asset.contentType
    });
  }

  for (const [route, asset] of loadedAssets) {
    app.get(route, async (_request, reply) =>
      reply
        .header("cache-control", "no-cache")
        .header("content-security-policy", contentSecurityPolicy)
        .header("referrer-policy", "no-referrer")
        .header("x-content-type-options", "nosniff")
        .header("x-frame-options", "DENY")
        .type(asset.contentType)
        .send(asset.body)
    );
  }

  app.get("/favicon.ico", async (_request, reply) =>
    reply
      .header("cache-control", "public, max-age=86400")
      .header("x-content-type-options", "nosniff")
      .code(204)
      .send()
  );
}
