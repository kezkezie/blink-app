import { describe, expect, it } from "vitest";
import { bearerKey, brandAllowed, hashKey, newKey } from "@/lib/mcp/keys";
import { SUPPORTED_VERSIONS, handleRpc, type McpTool } from "@/lib/mcp/protocol";

/** Connect your AI, stage 1 (2026-10-20): keys and the MCP protocol BlinkSpot serves. */
describe("BlinkSpot keys", () => {
  it("are long, random, shown once and stored as a hash", () => {
    const a = newKey(), b = newKey();
    expect(a.token).toMatch(/^bsk_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashKey(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.prefix).toBe(a.token.slice(0, 10));
  });
  it("are read from a bearer header only", () => {
    const { token } = newKey();
    expect(bearerKey(`Bearer ${token}`)).toBe(token);
    expect(bearerKey(token)).toBeNull();
    expect(bearerKey("Bearer sk_live_nope")).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
  it("only open the brands they were given", () => {
    const scope = { keyId: "k", clientId: "c", userId: "u", brandIds: ["b1"], permissions: ["read"], budget: 200 };
    expect(brandAllowed(scope, "b1")).toBe(true);
    expect(brandAllowed(scope, "b2")).toBe(false);
    expect(brandAllowed({ ...scope, brandIds: null }, "b2")).toBe(true);
  });
});

describe("the MCP protocol", () => {
  const echo: McpTool = { name: "echo", title: "Echo", description: "Says it back", inputSchema: { type: "object" }, readOnly: true, run: async (a) => ({ text: String(a.say), data: { said: a.say } }) };
  const boom: McpTool = { ...echo, name: "boom", run: async () => { throw new Error("db down"); } };
  it("initializes on the client's version when we speak it", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, [echo]);
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "blinkspot" } } });
    const r2 = await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, [echo]);
    expect((r2!.result as { protocolVersion: string }).protocolVersion).toBe(SUPPORTED_VERSIONS[1]);
  });
  it("lists tools with read-only hints and calls them", async () => {
    const list = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, [echo]);
    expect((list!.result as { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> }).tools[0]).toMatchObject({ name: "echo", annotations: { readOnlyHint: true } });
    const seen: string[] = [];
    const call = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "echo", arguments: { say: "hi" } } }, [echo], (t, ok) => seen.push(`${t}:${ok}`));
    expect(call!.result).toEqual({ content: [{ type: "text", text: "hi" }], structuredContent: { said: "hi" }, isError: false });
    expect(seen).toEqual(["echo:true"]);
  });
  it("answers errors the MCP way", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, [echo])).toBeNull();
    expect((await handleRpc({ jsonrpc: "2.0", id: 5, method: "resources/list" }, [echo]))!.error!.code).toBe(-32601);
    expect((await handleRpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope" } }, [echo]))!.error!.code).toBe(-32602);
    const failed = await handleRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "boom" } }, [boom]);
    expect(failed!.result).toMatchObject({ isError: true });
    expect(JSON.stringify(failed)).not.toContain("db down");
    expect((await handleRpc("x", [echo]))!.error!.code).toBe(-32600);
  });
});
