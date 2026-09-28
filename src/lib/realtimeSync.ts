import { AppData } from "../types";
import { normalizeAppData } from "./localStore";
import {
  applyOperations,
  diffToOperations,
  getClientId,
  Operation,
  OperationInput,
  optimizeOperations,
} from "./operations";

// ============================================
// 类型定义
// ============================================
export type SyncStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error";

export interface SyncState {
  status: SyncStatus;
  version: number;
  lastSyncAt: string;
  errorMessage: string;
  pendingCount: number;
}

interface AppStateResponse {
  id: string;
  data: AppData;
  version: number;
  updated_at: string;
}

// ============================================
// Supabase Realtime 连接管理
// ============================================
let realtimeConnection: WebSocket | null = null;
let reconnectTimer: number | null = null;
let heartbeatTimer: number | null = null;
let changeCallback: ((operations: Operation[]) => void) | null = null;

// WebSocket 连接到 Supabase Realtime
function connectRealtime(onOperation: (operation: Operation) => void): WebSocket {
  const ws = new WebSocket(`wss://${getSupabaseHost()}/realtime/v1/websocket?apikey=${getSupabaseKey()}&vsn=1.0.0`);

  ws.onopen = () => {
    console.log("[Realtime] 已连接");

    // 订阅 operations 表的变更
    const subscribePayload = {
      topic: "realtime:public:operations",
      event: "phx_join",
      payload: {
        config: {
          broadcast: { self: false },
          presence: { key: "" },
          postgres_changes: [
            {
              event: "INSERT",
              schema: "public",
              table: "operations",
            },
          ],
        },
      },
      ref: "1",
    };

    ws.send(JSON.stringify(subscribePayload));

    // 启动心跳
    startHeartbeat(ws);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      // 处理 INSERT 事件
      if (
        message.event === "postgres_changes" &&
        message.payload?.data?.type === "INSERT"
      ) {
        const operation = message.payload.data.record as Operation;

        // 忽略自己的操作
        if (operation.client_id !== getClientId()) {
          onOperation(operation);
        }
      }

      // 响应服务器心跳
      if (message.event === "phx_reply" && message.payload?.status === "ok") {
        console.log("[Realtime] 订阅成功");
      }
    } catch (error) {
      console.error("[Realtime] 消息解析失败:", error);
    }
  };

  ws.onerror = (error) => {
    console.error("[Realtime] 连接错误:", error);
  };

  ws.onclose = () => {
    console.log("[Realtime] 连接断开");
    stopHeartbeat();

    // 5秒后自动重连
    reconnectTimer = window.setTimeout(() => {
      if (changeCallback) {
        realtimeConnection = connectRealtime((op) => changeCallback?.([op]));
      }
    }, 5000);
  };

  return ws;
}

function startHeartbeat(ws: WebSocket) {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" }));
    }
  }, 30000); // 每30秒发送一次心跳
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function getSupabaseHost(): string {
  // Netlify Functions 会注入环境变量到全局
  const url = (import.meta.env?.SUPABASE_URL || (window as any).SUPABASE_URL || "");
  return url.replace(/^https?:\/\//, "");
}

function getSupabaseKey(): string {
  return (import.meta.env?.SUPABASE_ANON_KEY || (window as any).SUPABASE_ANON_KEY || "");
}

// ============================================
// HTTP 请求封装
// ============================================
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 空响应
  }

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message?: string }).message)
        : null) || `请求失败（${response.status}）`;
    const error = Object.assign(new Error(message), {
      status: response.status,
      code: (body && typeof body === "object" && "code" in body ? (body as { code?: string }).code : null),
    });
    throw error;
  }

  return body as T;
}

// ============================================
// 云端 API
// ============================================

// 获取主数据
export async function fetchAppState(): Promise<{ data: AppData; version: number }> {
  const response = await request<AppStateResponse>("/api/app-state");
  return {
    data: normalizeAppData(response.data),
    version: response.version,
  };
}

// 提交操作到云端
export async function submitOperations(operations: OperationInput[]): Promise<void> {
  const optimized = optimizeOperations(operations);
  if (optimized.length === 0) return;

  const payload = optimized.map((op) => ({
    client_id: getClientId(),
    module: op.module,
    operation_type: op.operation_type,
    record_id: op.record_id,
    payload: op.payload,
    base_version: op.base_version,
  }));

  await request("/api/operations", {
    method: "POST",
    body: JSON.stringify({ operations: payload }),
  });
}

// 获取指定版本之后的所有操作
export async function fetchOperationsSince(version: number): Promise<Operation[]> {
  return request<Operation[]>(`/api/operations?since=${version}`);
}

// ============================================
// 实时同步管理器
// ============================================
export class RealtimeSyncManager {
  private data: AppData;
  private version: number;
  private status: SyncStatus;
  private errorMessage: string;
  private onChange: ((data: AppData, state: SyncState) => void) | null;
  private pendingOperations: OperationInput[];
  private syncTimer: number | null;

  constructor() {
    this.data = normalizeAppData({
      startDate: "",
      bucketItems: [],
      periodRecords: [],
      messages: [],
      locations: [],
      travelCheckins: [],
      musicItems: [],
      mediaItems: [],
      foodPlaces: [],
      savingGoals: [],
      achievements: [],
      moments: [],
      comments: [],
      anniversaries: [],
    });
    this.version = 0;
    this.status = "disconnected";
    this.errorMessage = "";
    this.onChange = null;
    this.pendingOperations = [];
    this.syncTimer = null;
  }

  // 初始化：加载远程数据并订阅变更
  async initialize(callback: (data: AppData, state: SyncState) => void) {
    this.onChange = callback;
    this.status = "connecting";
    this.notifyChange();

    try {
      // 加载主数据
      const state = await fetchAppState();
      this.data = state.data;
      this.version = state.version;

      // 连接 Realtime
      changeCallback = (operations: Operation[]) => this.handleRemoteOperations(operations);
      realtimeConnection = connectRealtime((op) => changeCallback?.([op]));

      this.status = "connected";
      this.errorMessage = "";
      this.notifyChange();

      // 启动定期同步（每10秒）
      this.startPeriodicSync();
    } catch (error) {
      console.error("[Sync] 初始化失败:", error);
      this.status = "error";
      this.errorMessage = error instanceof Error ? error.message : "初始化失败";
      this.notifyChange();
    }
  }

  // 处理远程操作推送
  private handleRemoteOperations(operations: Operation[]) {
    if (operations.length === 0) return;

    console.log(`[Sync] 收到 ${operations.length} 个远程操作`);

    // 按时间排序并应用
    const sorted = operations.sort((a, b) => a.created_at.localeCompare(b.created_at));
    this.data = applyOperations(this.data, sorted);

    // 更新版本号
    const maxVersion = Math.max(...sorted.map((op) => op.base_version || 0));
    if (maxVersion > this.version) {
      this.version = maxVersion;
    }

    this.notifyChange();
  }

  // 提交本地修改
  async applyLocalChange(newData: AppData) {
    const operations = this.diffToOperations(this.data, newData);
    if (operations.length === 0) return;

    // 乐观更新本地数据
    this.data = newData;
    this.pendingOperations.push(...operations);
    this.notifyChange();

    // 异步提交到云端
    this.scheduleSyncNow();
  }

  // 比对数据生成操作
  private diffToOperations(previous: AppData, next: AppData): OperationInput[] {
    return diffToOperations(previous, next, this.version);
  }

  // 立即同步
  private scheduleSyncNow() {
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
    }

    this.syncTimer = window.setTimeout(() => {
      void this.flushPendingOperations();
    }, 500); // 延迟500ms批量提交
  }

  // 提交待处理操作
  private async flushPendingOperations() {
    if (this.pendingOperations.length === 0) return;

    const operations = [...this.pendingOperations];
    this.pendingOperations = [];

    this.status = "syncing";
    this.notifyChange();

    try {
      await submitOperations(operations);
      this.status = "connected";
      this.errorMessage = "";
    } catch (error) {
      console.error("[Sync] 提交操作失败:", error);
      this.status = "error";
      this.errorMessage = error instanceof Error ? error.message : "同步失败";

      // 失败的操作重新加入队列
      this.pendingOperations.unshift(...operations);

      // 3秒后重试
      window.setTimeout(() => {
        void this.flushPendingOperations();
      }, 3000);
    }

    this.notifyChange();
  }

  // 定期拉取遗漏的操作（降级方案）
  private startPeriodicSync() {
    window.setInterval(() => {
      void this.pullMissingOperations();
    }, 30000); // 每30秒检查一次
  }

  private async pullMissingOperations() {
    try {
      const operations = await fetchOperationsSince(this.version);
      if (operations.length > 0) {
        console.log(`[Sync] 拉取到 ${operations.length} 个遗漏操作`);
        this.handleRemoteOperations(operations);
      }
    } catch (error) {
      console.error("[Sync] 拉取操作失败:", error);
    }
  }

  // 通知状态变更
  private notifyChange() {
    if (!this.onChange) return;

    const state: SyncState = {
      status: this.status,
      version: this.version,
      lastSyncAt: new Date().toISOString(),
      errorMessage: this.errorMessage,
      pendingCount: this.pendingOperations.length,
    };

    this.onChange(this.data, state);
  }

  // 获取当前数据
  getData(): AppData {
    return this.data;
  }

  // 获取当前状态
  getState(): SyncState {
    return {
      status: this.status,
      version: this.version,
      lastSyncAt: new Date().toISOString(),
      errorMessage: this.errorMessage,
      pendingCount: this.pendingOperations.length,
    };
  }

  // 断开连接
  disconnect() {
    if (realtimeConnection) {
      realtimeConnection.close();
      realtimeConnection = null;
    }

    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    stopHeartbeat();

    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    changeCallback = null;
    this.status = "disconnected";
    this.notifyChange();
  }
}
