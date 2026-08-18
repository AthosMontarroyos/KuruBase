import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DataService } from "../db/data-service.js";

const tableParamsSchema = z.object({
  table: z.string().regex(/^[a-z_][a-z0-9_]*$/)
});
const mutationRecordSchema = z.record(z.string(), z.unknown());
const insertSchema = z.union([
  mutationRecordSchema.transform((row) => [row]),
  z.array(mutationRecordSchema).min(1).max(1000)
]);

export async function registerDataRoutes(
  app: FastifyInstance,
  dataService: DataService
): Promise<void> {
  app.get("/v1/data/:table", async (request, reply) => {
    const { table } = tableParamsSchema.parse(request.params);
    const result = await dataService.select({
      table,
      rawUrl: request.raw.url ?? "",
      claims: request.auth
    });
    return reply.code(result.status).send(result);
  });

  app.post("/v1/data/:table", async (request, reply) => {
    const { table } = tableParamsSchema.parse(request.params);
    const rows = insertSchema.parse(request.body);
    const result = await dataService.insert(
      { table, rawUrl: request.raw.url ?? "", claims: request.auth },
      rows
    );
    return reply.code(result.status).send(result);
  });

  app.patch("/v1/data/:table", async (request, reply) => {
    const { table } = tableParamsSchema.parse(request.params);
    const changes = mutationRecordSchema.parse(request.body);
    const result = await dataService.update(
      { table, rawUrl: request.raw.url ?? "", claims: request.auth },
      changes
    );
    return reply.code(result.status).send(result);
  });

  app.delete("/v1/data/:table", async (request, reply) => {
    const { table } = tableParamsSchema.parse(request.params);
    const result = await dataService.delete({
      table,
      rawUrl: request.raw.url ?? "",
      claims: request.auth
    });
    return reply.code(result.status).send(result);
  });
}
