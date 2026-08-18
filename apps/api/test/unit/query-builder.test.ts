import { describe, expect, it } from "vitest";
import { AppError } from "../../src/errors.js";
import type { TableDefinition } from "../../src/db/catalog.js";
import {
  buildInsert,
  buildSelect,
  buildUpdate,
  parseDataQuery
} from "../../src/db/query-builder.js";

const table: TableDefinition = {
  schema: "api",
  name: "records",
  columns: new Map(
    ["id", "owner_id", "org_id", "data", "created_at"].map((name) => [
      name,
      { name, dataType: "text", nullable: name === "org_id" }
    ])
  )
};

describe("data query builder", () => {
  it("catalog-validates identifiers and parameterizes values", () => {
    const parsed = parseDataQuery(
      "/v1/data/records?select=id,data&owner_id=eq.user-a&order=created_at.desc&limit=20",
      table
    );
    const query = buildSelect(table, parsed);

    expect(query.text).toContain('"api"."records"');
    expect(query.text).toContain('"owner_id" = $1');
    expect(query.text).not.toContain("user-a");
    expect(query.values).toEqual(["user-a", 20, 0]);
  });

  it("rejects unknown columns", () => {
    expect(() =>
      parseDataQuery("/v1/data/records?secret=eq.value", table)
    ).toThrow(AppError);
  });

  it("rejects unfiltered updates", () => {
    const parsed = parseDataQuery("/v1/data/records?select=id", table);
    expect(() => buildUpdate(table, parsed, { data: { safe: true } })).toThrow(
      "Update requires at least one filter"
    );
  });

  it("uses SQL null semantics", () => {
    const parsed = parseDataQuery("/v1/data/records?org_id=eq.null", table);
    const query = buildSelect(table, parsed);
    expect(query.text).toContain('"org_id" is null');
    expect(query.values).toEqual([100, 0]);
  });

  it("accepts bulk rows whose identical columns use a different JSON order", () => {
    const parsed = parseDataQuery("/v1/data/records?select=id", table);
    const query = buildInsert(table, parsed, [
      { owner_id: "user-a", data: { index: 1 } },
      { data: { index: 2 }, owner_id: "user-a" }
    ]);

    expect(query.values).toEqual([
      "user-a",
      { index: 1 },
      "user-a",
      { index: 2 }
    ]);
  });
});
