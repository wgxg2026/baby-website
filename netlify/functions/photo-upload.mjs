// 照片上传（验证令牌后直接转发到 Storage）
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
    const token = body.token;
    const contentType = String(body.contentType || "image/jpeg");
    const filename = String(body.filename || "photo.jpg");
    const base64 = String(body.base64 || "");

    if (!token) {
      return json(401, { message: "缺少上传令牌" });
    }

    // 验证令牌
    const tokens = await supabaseRequest(
      `upload_tokens?select=*&id=eq.${token}&used=eq.false&expires_at=gte.${new Date().toISOString()}`
    );

    if (!tokens || tokens.length === 0) {
      return json(401, { message: "令牌无效或已过期" });
    }

    const tokenRecord = tokens[0];
    const maxSizeMb = tokenRecord.max_file_size_mb || 10;

    // 验证文件格式
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(contentType.toLowerCase())) {
      return json(415, { message: "只支持 JPG、PNG、WebP 或 GIF 图片" });
    }

    // 验证文件大小
    if (!base64 || base64.length > maxSizeMb * 1024 * 1024 * 1.4) {
      return json(413, { message: `图片太大，请保持在 ${maxSizeMb}MB 以内` });
    }

    // 生成文件路径
    const suffix = filename.includes(".") ? filename.split(".").pop().toLowerCase() : contentType.split("/").pop();
    const extension = suffix === "jpeg" ? "jpg" : suffix;
    const path = `${crypto.randomUUID()}.${extension || "jpg"}`;

    // 解码 base64
    const bytes = Buffer.from(base64, "base64");

    // 上传到 Supabase Storage
    const { url, key } = config();
    const uploadResponse = await fetch(`${url}/storage/v1/object/moments/${path}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": contentType,
        "x-upsert": "false",
      },
      body: bytes,
    });

    const uploadText = await uploadResponse.text();
    if (!uploadResponse.ok) {
      return json(uploadResponse.status, {
        message: "照片云端上传失败",
        details: uploadText,
      });
    }

    // 标记令牌已使用
    await supabaseRequest(`upload_tokens?id=eq.${token}`, {
      method: "PATCH",
      body: JSON.stringify({ used: true, used_at: new Date().toISOString() }),
    });

    return json(200, {
      path: `/api/moment-image/${path}`,
      contentType,
    });
  } catch (error) {
    console.error("[photo-upload] 错误:", error);
    return json(Number(error && error.status) || 502, {
      message: error instanceof Error ? error.message : "照片上传失败",
    });
  }
}
