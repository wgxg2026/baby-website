// 操作日志 API：提交操作和查询操作
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
      // 查询指定版本之后的操作
      const params = new URL(event.rawUrl || "http://localhost?" + (event.rawQuery || "")).searchParams;
      const since = parseInt(params.get("since") || "0", 10);

      const operations = await supabaseRequest(
        `operations?select=*&base_version=gte.${since}&order=created_at.asc&limit=1000`
      );

      return json(200, operations || []);
    }

    if (event.httpMethod === "POST") {
      // 批量插入操作
      const body = JSON.parse(event.body || "{}");
      const operations = body.operations;

      if (!Array.isArray(operations) || operations.length === 0) {
        return json(400, { message: "operations 字段必须是非空数组" });
      }

      // 验证操作格式
      for (const op of operations) {
        if (!op.client_id || !op.module || !op.operation_type || !op.record_id) {
          return json(400, { message: "操作格式不正确" });
        }
      }

      // 批量插入
      const inserted = await supabaseRequest("operations", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(operations),
      });

      // 触发后台合并（异步，不等待）
      try {
        await supabaseRequest("rpc/apply_pending_operations", { method: "POST", body: "{}" });
      } catch (error) {
        console.error("[operations] 触发合并失败:", error);
        // 不影响主流程，定时任务会兜底
      }

      return json(201, { inserted: inserted ? inserted.length : operations.length });
    }

    return json(405, { message: "只支持 GET 和 POST 请求" });
  } catch (error) {
    console.error("[operations] 错误:", error);
    return json(Number(error && error.status) || 502, {
      message: error instanceof Error ? error.message : "操作失败",
    });
  }
}
