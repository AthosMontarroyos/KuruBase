import type { FastifyInstance } from "fastify";
import { requireScope } from "../authorization.js";

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/admin/status", async (request) => {
    requireScope(request.auth, "kurubase:admin");
    return {
      data: {
        status: "ok",
        subject: request.auth.sub
      },
      error: null,
      count: null,
      status: 200
    };
  });
}
