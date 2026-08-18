import type { FastifyInstance } from "fastify";
import { forbidden } from "../errors.js";

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/admin/status", async (request) => {
    if (!request.auth.scopes.includes("kurubase:admin")) {
      throw forbidden("The kurubase:admin scope is required");
    }
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
