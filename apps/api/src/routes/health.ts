import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

export async function registerHealthRoutes(app: FastifyInstance, pool: Pool): Promise<void> {
  app.get("/health/live", async () => ({
    data: { status: "ok" },
    error: null,
    count: null,
    status: 200
  }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await pool.query("select 1");
      return {
        data: { status: "ready" },
        error: null,
        count: null,
        status: 200
      };
    } catch {
      return reply.code(503).send({
        data: null,
        error: { code: "NOT_READY", message: "The database is unavailable" },
        count: null,
        status: 503
      });
    }
  });
}
