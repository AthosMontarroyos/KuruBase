import type { FastifyInstance } from "fastify";

export async function registerIdentityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/me", async (request) => ({
    data: {
      sub: request.auth.sub,
      org_id: request.auth.org_id,
      roles: request.auth.roles,
      scopes: request.auth.scopes
    },
    error: null,
    count: null,
    status: 200
  }));
}
