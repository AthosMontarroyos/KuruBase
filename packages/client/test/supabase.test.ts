import { describe, expect, it, vi } from "vitest";
import { createClient } from "../src/supabase.js";

interface RecordRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  data: Record<string, unknown>;
  created_at: string;
}

describe("supabase.ts client", () => {
  it("serializes familiar select and filter chains", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [], error: null, count: 0, status: 200 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = createClient("https://database.test/", {
      accessToken: async () => "signed-token",
      fetch: fetchMock
    });

    await client
      .from<RecordRow>("records")
      .select("id,data", { count: "exact" })
      .eq("owner_id", "user-a")
      .order("created_at", { ascending: false })
      .range(20, 39);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/v1/data/records?");
    expect(String(url)).toContain("owner_id=eq.user-a");
    expect(String(url)).toContain("limit=20");
    expect(String(url)).toContain("offset=20");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer signed-token");
  });

  it("serializes mutations and never exposes an auth namespace", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [], error: null, count: null, status: 200 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = createClient("https://database.test", {
      accessToken: "token",
      fetch: fetchMock
    });

    await client
      .from<RecordRow>("records")
      .update({ data: { enabled: true } })
      .eq("id", "record-a")
      .select("id,data");

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ data: { enabled: true } }));
    expect("auth" in client).toBe(false);
  });

  it("returns a stable envelope for network failures", async () => {
    const client = createClient("https://database.test", {
      accessToken: "token",
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"))
    });
    const result = await client.from<RecordRow>("records").select();
    expect(result).toMatchObject({
      data: null,
      error: { code: "NETWORK_ERROR" },
      count: null,
      status: 0
    });
  });
});
