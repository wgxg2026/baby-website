import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler as cloudHandler } from "../cloud-state.mjs";
import { handler as uploadHandler } from "../moment-upload.mjs";
import { handler as imageHandler } from "../moment-image.mjs";

beforeEach(() => { process.env.SUPABASE_URL="https://example.supabase.co"; process.env.SUPABASE_ANON_KEY="test-key"; });
afterEach(() => vi.unstubAllGlobals());

describe("cloud-state proxy", () => {
  it("filters reads to allowed module ids", async () => { const fetchMock=vi.fn().mockResolvedValue(new Response("[]",{status:200,headers:{"content-type":"application/json"}})); vi.stubGlobal("fetch",fetchMock); const response=await cloudHandler({httpMethod:"GET",rawUrl:"https://site.test/api/cloud-state?ids=messages,notAllowed"}); expect(response.statusCode).toBe(200); expect(String(fetchMock.mock.calls[0][0])).toContain("id=in.(messages)"); });
  it("never reads the legacy default row", async () => { const fetchMock=vi.fn().mockResolvedValue(new Response("[]",{status:200,headers:{"content-type":"application/json"}})); vi.stubGlobal("fetch",fetchMock); await cloudHandler({httpMethod:"GET",rawUrl:"https://site.test/api/cloud-state?ids=default,messages"}); expect(String(fetchMock.mock.calls[0][0])).toContain("id=in.(messages)"); });
  it("returns 409 when optimistic update matches no row", async () => { vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("[]",{status:200,headers:{"content-type":"application/json"}}))); const response=await cloudHandler({httpMethod:"PUT",body:JSON.stringify({id:"messages",data:[],expectedUpdatedAt:"old"})}); expect(response.statusCode).toBe(409); });
  it("rejects writes to unknown modules", async () => { vi.stubGlobal("fetch",vi.fn()); const response=await cloudHandler({httpMethod:"PUT",body:JSON.stringify({id:"secret",data:{}})}); expect(response.statusCode).toBe(400); });
});

describe("photo proxy", () => {
  it("rejects unsupported image types", async () => { const response=await uploadHandler({httpMethod:"POST",body:JSON.stringify({filename:"x.svg",contentType:"image/svg+xml",base64:"PHN2Zz4="})}); expect(response.statusCode).toBe(415); });
  it("uploads an allowed image", async () => { vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{status:200}))); const response=await uploadHandler({httpMethod:"POST",body:JSON.stringify({filename:"x.jpg",contentType:"image/jpeg",base64:"eA=="})}); expect(response.statusCode).toBe(200); expect(JSON.parse(response.body).path).toMatch(/\.jpg$/); });
  it("proxies an existing image with cache headers", async () => { vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]),{status:200,headers:{"content-type":"image/jpeg"}}))); const response=await imageHandler({queryStringParameters:{path:"photo.jpg"}}); expect(response.statusCode).toBe(200); expect(response.isBase64Encoded).toBe(true); expect(response.headers["cache-control"]).toContain("immutable"); });
});
