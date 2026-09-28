import { AppData, Message, MessageReply } from "../types";

// ============================================
// 类型定义
// ============================================
export type OperationType = "upsert" | "delete" | "add_reply" | "delete_reply" | "set_setting";

export interface Operation {
  id: string;
  client_id: string;
  module: string;
  operation_type: OperationType;
  record_id: string;
  payload?: unknown;
  base_version: number;
  created_at: string;
  applied: boolean;
  applied_at?: string;
}

export interface OperationInput {
  module: string;
  operation_type: OperationType;
  record_id: string;
  payload?: unknown;
  base_version: number;
}

// ============================================
// 客户端 ID 管理
// ============================================
const CLIENT_ID_KEY = "couple-time-capsule-client-id-v2";

export function getClientId(): string {
  if (typeof window === "undefined") return "server";

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    try {
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    } catch {
      // localStorage 不可用时使用临时 ID
    }
  }
  return clientId;
}

// ============================================
// 操作生成
// ============================================
export function createOperation(
  module: string,
  operationType: OperationType,
  recordId: string,
  payload: unknown,
  baseVersion: number
): OperationInput {
  return {
    module,
    operation_type: operationType,
    record_id: recordId,
    payload,
    base_version: baseVersion,
  };
}

// 比对两个数据状态，生成操作列表
export function diffToOperations(
  previous: AppData,
  next: AppData,
  baseVersion: number
): OperationInput[] {
  const operations: OperationInput[] = [];

  // 检查 startDate 变化
  if (previous.startDate !== next.startDate) {
    operations.push(
      createOperation("settings", "set_setting", "startDate", next.startDate, baseVersion)
    );
  }

  // 检查各模块的记录变化
  const modules: (keyof Omit<AppData, "startDate">)[] = [
    "bucketItems",
    "periodRecords",
    "locations",
    "travelCheckins",
    "musicItems",
    "mediaItems",
    "foodPlaces",
    "savingGoals",
    "achievements",
    "moments",
    "comments",
    "anniversaries",
  ];

  for (const module of modules) {
    const prevRecords = previous[module] as Array<{ id: string }>;
    const nextRecords = next[module] as Array<{ id: string }>;

    const prevMap = new Map(prevRecords.map((r) => [r.id, r]));
    const nextMap = new Map(nextRecords.map((r) => [r.id, r]));

    // 新增或修改
    for (const record of nextRecords) {
      const prevRecord = prevMap.get(record.id);
      if (!prevRecord) {
        // 新增
        operations.push(createOperation(module, "upsert", record.id, record, baseVersion));
      } else if (JSON.stringify(prevRecord) !== JSON.stringify(record)) {
        // 修改
        operations.push(createOperation(module, "upsert", record.id, record, baseVersion));
      }
    }

    // 删除
    for (const record of prevRecords) {
      if (!nextMap.has(record.id)) {
        operations.push(createOperation(module, "delete", record.id, undefined, baseVersion));
      }
    }
  }

  // 特殊处理消息回复
  const prevMessages = previous.messages;
  const nextMessages = next.messages;
  const prevMsgMap = new Map(prevMessages.map((m) => [m.id, m]));

  for (const message of nextMessages) {
    const prevMessage = prevMsgMap.get(message.id);
    if (!prevMessage) continue; // 新消息由上面的 upsert 处理

    const prevReplies = prevMessage.replies ?? [];
    const nextReplies = message.replies ?? [];
    const prevReplyMap = new Map(prevReplies.map((r) => [r.id, r]));
    const nextReplyMap = new Map(nextReplies.map((r) => [r.id, r]));

    // 新增或修改回复
    for (const reply of nextReplies) {
      const prevReply = prevReplyMap.get(reply.id);
      if (!prevReply || JSON.stringify(prevReply) !== JSON.stringify(reply)) {
        operations.push(
          createOperation("messages", "add_reply", message.id, reply, baseVersion)
        );
      }
    }

    // 删除回复
    for (const reply of prevReplies) {
      if (!nextReplyMap.has(reply.id)) {
        operations.push(
          createOperation("messages", "delete_reply", message.id, reply.id, baseVersion)
        );
      }
    }
  }

  return operations;
}

// ============================================
// 操作应用（本地预览）
// ============================================
export function applyOperationToData(data: AppData, operation: Operation): AppData {
  const next = structuredClone(data);

  if (operation.operation_type === "set_setting") {
    next.startDate = String(operation.payload ?? "");
    return next;
  }

  if (operation.module === "messages" && operation.operation_type === "add_reply") {
    const messages = [...next.messages];
    const index = messages.findIndex((m) => m.id === operation.record_id);
    if (index >= 0) {
      const message = { ...messages[index] };
      const reply = operation.payload as MessageReply;
      const replies = [...(message.replies ?? [])];
      const replyIndex = replies.findIndex((r) => r.id === reply.id);
      if (replyIndex >= 0) {
        replies[replyIndex] = reply;
      } else {
        replies.push(reply);
      }
      message.replies = replies;
      message.status = "replied";
      messages[index] = message;
    }
    next.messages = messages;
    return next;
  }

  if (operation.module === "messages" && operation.operation_type === "delete_reply") {
    const messages = [...next.messages];
    const index = messages.findIndex((m) => m.id === operation.record_id);
    if (index >= 0) {
      const message = { ...messages[index] };
      message.replies = (message.replies ?? []).filter((r) => r.id !== operation.payload);
      messages[index] = message;
    }
    next.messages = messages;
    return next;
  }

  if (operation.operation_type === "delete") {
    const module = operation.module as keyof Omit<AppData, "startDate">;
    const records = next[module] as Array<{ id: string }>;
    next[module] = records.filter((r) => r.id !== operation.record_id) as never;
    return next;
  }

  if (operation.operation_type === "upsert") {
    const module = operation.module as keyof Omit<AppData, "startDate">;
    const records = [...(next[module] as Array<{ id: string }>)];
    const index = records.findIndex((r) => r.id === operation.record_id);
    const payload = operation.payload as { id: string };

    if (index >= 0) {
      // 特殊处理消息：合并 replies
      if (module === "messages") {
        const existing = records[index] as Message;
        const incoming = payload as Message;
        records[index] = {
          ...existing,
          ...incoming,
          replies: mergeReplies(existing.replies ?? [], incoming.replies ?? []),
        } as { id: string };
      } else {
        records[index] = payload;
      }
    } else {
      records.unshift(payload);
    }

    next[module] = records as never;
    return next;
  }

  return next;
}

function mergeReplies(remote: MessageReply[], local: MessageReply[]): MessageReply[] {
  const map = new Map(remote.map((r) => [r.id, r]));
  local.forEach((r) => map.set(r.id, r));
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// 批量应用操作
export function applyOperations(data: AppData, operations: Operation[]): AppData {
  let result = data;
  for (const operation of operations) {
    result = applyOperationToData(result, operation);
  }
  return result;
}

// ============================================
// 操作优化（减少冗余）
// ============================================
export function optimizeOperations(operations: OperationInput[]): OperationInput[] {
  const result: OperationInput[] = [];
  const seen = new Map<string, number>(); // key -> index in result

  for (const op of operations) {
    const key = `${op.module}:${op.record_id}:${op.operation_type}`;

    if (op.operation_type === "upsert" || op.operation_type === "set_setting") {
      // 同一记录的多次 upsert，只保留最后一次
      const existingIndex = seen.get(`${op.module}:${op.record_id}:upsert`);
      if (existingIndex !== undefined) {
        result[existingIndex] = op;
      } else {
        seen.set(key, result.length);
        result.push(op);
      }
    } else if (op.operation_type === "delete") {
      // 如果之前有 upsert 同一记录，删除那个 upsert
      const upsertIndex = seen.get(`${op.module}:${op.record_id}:upsert`);
      if (upsertIndex !== undefined) {
        result.splice(upsertIndex, 1);
        // 更新后续索引
        for (const [k, v] of seen.entries()) {
          if (v > upsertIndex) seen.set(k, v - 1);
        }
        seen.delete(`${op.module}:${op.record_id}:upsert`);
      }
      // 同一记录的多次 delete，只保留最后一次
      const deleteIndex = seen.get(key);
      if (deleteIndex === undefined) {
        seen.set(key, result.length);
        result.push(op);
      }
    } else {
      // add_reply 和 delete_reply 按 payload.id 去重
      const replyId =
        op.operation_type === "add_reply"
          ? (op.payload as MessageReply)?.id
          : String(op.payload ?? "");
      const replyKey = `${op.module}:${op.record_id}:${op.operation_type}:${replyId}`;

      if (op.operation_type === "add_reply") {
        const existingIndex = seen.get(replyKey);
        if (existingIndex !== undefined) {
          result[existingIndex] = op;
        } else {
          seen.set(replyKey, result.length);
          result.push(op);
        }
      } else {
        // delete_reply：如果之前有 add_reply，互相抵消
        const addKey = `${op.module}:${op.record_id}:add_reply:${replyId}`;
        const addIndex = seen.get(addKey);
        if (addIndex !== undefined) {
          result.splice(addIndex, 1);
          for (const [k, v] of seen.entries()) {
            if (v > addIndex) seen.set(k, v - 1);
          }
          seen.delete(addKey);
        } else {
          const existingIndex = seen.get(replyKey);
          if (existingIndex === undefined) {
            seen.set(replyKey, result.length);
            result.push(op);
          }
        }
      }
    }
  }

  return result;
}
