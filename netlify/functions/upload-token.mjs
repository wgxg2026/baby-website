// 生成照片上传令牌
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Netlify 环境变量未配置");
  return { url: url.endsWith("/") ? url.slice(0, -1) : url, key };
}

async function supabaseRequest(path, init = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(
      data && data.message ? data.message : `Supabase 请求失败（${response.status}）`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { message: "只支持 POST 请求" });
    }

    const body = JSON.parse(event.body || "{}");
    const clientId = body.client_id || crypto.randomUUID();
    const maxFileSizeMb = Math.min(parseInt(body.max_file_size_mb || "10", 10), 20);

    // 生成5分钟有效期的令牌
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const token = await supabaseRequest("upload_tokens", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        client_id: clientId,
        purpose: "moment_photo",
        max_file_size_mb: maxFileSizeMb,
        expires_at: expiresAt,
      }),
    });

    const tokenId = Array.isArray(token) && token.length > 0 ? token[0].id : null;

    if (!tokenId) {
      throw new Error("令牌生成失败");
    }

    return json(200, {
      token: tokenId,
      expires_at: expiresAt,
      upload_url: `/api/photo-upload`,
    });
  } catch (error) {
    console.error("[upload-token] 错误:", error);
    return json(Number(error && error.status) || 502, {
      message: error instanceof Error ? error.message : "令牌生成失败",
    });
  }
}
