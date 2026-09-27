const uploadEndpoint = "/api/moment-upload";
export const hasSupabaseConfig = true;
export const momentsBucket = "moments";

export function proxyImageUrl(value: string) {
  if (!value) return value;
  if (value.startsWith("/api/") || value.startsWith("data:image/")) return value;
  const match = value.match(/\/storage\/v1\/object\/public\/moments\/(.+)$/);
  return match ? "/api/moment-image/" + match[1] : value;
}

function friendlyUploadError(status: number, body: unknown) {
  const message = typeof body === "object" && body && "message" in body ? String((body as { message?: unknown }).message ?? "") : "";
  if (status === 413) return "图片太大，请换一张或稍微压缩后重试";
  if (status === 415) return "图片格式不支持，请使用 JPG、PNG 或 WebP";
  if (status === 401 || status === 403) return "照片存储权限没有配置好，请检查 Netlify 环境变量和 Storage 策略";
  return message || "照片上传失败，网络恢复后可以继续重试";
}

export async function uploadMomentImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + step, bytes.length)));
  const response = await fetch(uploadEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type, base64: btoa(binary) }) });
  let body: unknown = null;
  try { body = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(friendlyUploadError(response.status, body));
  const path = String((body as { path?: string })?.path ?? "");
  if (!path) throw new Error("照片上传后没有得到云端地址，请稍后重试");
  return "/api/moment-image/" + path;
}

export async function uploadMomentDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return uploadMomentImage(new File([blob], "legacy.jpg", { type: blob.type || "image/jpeg" }));
}
