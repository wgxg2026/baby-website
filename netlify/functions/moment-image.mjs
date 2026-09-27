export async function handler(event) {
  try {
    const raw = event.queryStringParameters?.path || ""; const path = decodeURIComponent(raw).replace(/^\/+/, ""); if (!path || path.includes("..") || !path.split("").every((char) => /[a-zA-Z0-9._/-]/.test(char))) return { statusCode: 400, body: "invalid path" };
    const rawUrl = process.env.SUPABASE_URL; const key = process.env.SUPABASE_ANON_KEY; if (!rawUrl || !key) return { statusCode: 500, body: "missing config" }; const url = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl; const response = await fetch(`${url}/storage/v1/object/moments/${path}`, { headers: { apikey: key, authorization: `Bearer ${key}` } }); if (!response.ok) return { statusCode: response.status, body: "image unavailable" }; const bytes = Buffer.from(await response.arrayBuffer()); return { statusCode: 200, isBase64Encoded: true, headers: { "content-type": response.headers.get("content-type") || "image/jpeg", "cache-control": "public,max-age=31536000,immutable" }, body: bytes.toString("base64") };
  } catch { return { statusCode: 502, body: "image proxy failed" }; }
}
