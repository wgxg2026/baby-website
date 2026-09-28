// 获取主数据状态的 API
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
    if (event.httpMethod === "GET") {
      // 读取主数据
      const rows = await supabaseRequest("app_state_v2?select=id,data,version,updated_at&id=eq.default");

      if (!rows || rows.length === 0) {
        return json(404, { message: "数据未初始化" });
      }

      const state = rows[0];
      return json(200, {
        id: state.id,
        data: state.data,
        version: state.version,
        updated_at: state.updated_at,
      });
    }

    return json(405, { message: "只支持 GET 请求" });
  } catch (error) {
    console.error("[app-state] 错误:", error);
    return json(Number(error && error.status) || 502, {
      message: error instanceof Error ? error.message : "读取数据失败",
    });
  }
}
