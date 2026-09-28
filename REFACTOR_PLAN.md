# 云端同步重构方案

## 问题分析

### 当前架构的核心问题
1. **轮询低效**：每 5 秒轮询所有模块，造成大量无效请求和服务器负载
2. **冲突频繁**：多设备编辑时，乐观锁 `updated_at` 机制导致频繁 409 冲突
3. **数据丢失风险**：pending operations 压缩逻辑复杂，localStorage 可能被清理
4. **照片上传慢**：base64 编码 → Function 转发 → Storage，增加延迟和失败率
5. **无版本控制**：修改直接覆盖，无法恢复历史数据或查看修改记录

## 新架构设计

### 核心理念
- **单一数据源**：Supabase 为唯一真相源，本地只做缓存
- **操作日志驱动**：每次修改记录为独立操作，支持重放和合并
- **实时推送**：启用 Supabase Realtime，秒级同步无需轮询
- **乐观 UI**：本地立即响应，后台异步同步，失败时回滚提示

### 数据库设计

#### 1. 主数据表 `app_state`（简化版）
```sql
CREATE TABLE app_state (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 行级安全策略：允许匿名读写
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous access" ON app_state FOR ALL USING (true);
```

#### 2. 操作日志表 `operations`（新增）
```sql
CREATE TABLE operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module text NOT NULL,
  operation_type text NOT NULL, -- upsert/delete/add_reply/delete_reply
  record_id text NOT NULL,
  payload jsonb,
  version bigint NOT NULL, -- 基于哪个版本的操作
  created_at timestamptz NOT NULL DEFAULT now(),
  applied boolean DEFAULT false
);

CREATE INDEX idx_operations_created ON operations(created_at DESC);
CREATE INDEX idx_operations_applied ON operations(applied) WHERE NOT applied;

ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous access" ON operations FOR ALL USING (true);
```

#### 3. 照片上传令牌表 `upload_tokens`（新增）
```sql
CREATE TABLE upload_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_upload_tokens_expires ON upload_tokens(expires_at);

ALTER TABLE upload_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read" ON upload_tokens FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert" ON upload_tokens FOR INSERT WITH CHECK (true);

-- 自动清理过期令牌
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM upload_tokens WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;
```

### 新的同步流程

#### 初始化
1. 前端加载时读取 `app_state.data`
2. 订阅 `operations` 表的 Realtime 变更
3. 获取未应用的操作并合并到本地

#### 用户修改数据
1. 立即更新本地状态（乐观 UI）
2. 生成 operation 对象，插入 `operations` 表
3. Realtime 推送给所有在线设备
4. 后台定时（10秒）将操作合并写入 `app_state`

#### 冲突处理
- 操作日志按 `created_at` 排序应用，Last-Write-Wins
- 删除操作优先级最高
- 消息回复按 ID 去重合并

#### 照片上传
1. 前端生成上传令牌（调用 Function）
2. 直接上传到 Supabase Storage（带令牌验证）
3. Storage Policy 检查令牌有效性
4. 成功后返回路径，无需 Function 转发

### 代码改动清单

#### 新增文件
- `supabase/migrations/002_refactor_sync.sql` - 数据库迁移脚本
- `src/lib/realtimeSync.ts` - 新的实时同步逻辑
- `src/lib/operations.ts` - 操作日志处理
- `netlify/functions/upload-token.mjs` - 生成上传令牌

#### 修改文件
- `src/lib/sharedCloud.ts` - 简化为操作日志接口
- `src/App.tsx` - 切换到新同步机制
- `netlify/functions/cloud-state.mjs` - 改为操作合并端点
- 删除 `moment-upload.mjs` - 不再需要照片转发

### Storage Policy 配置

```sql
-- 允许匿名读取所有照片
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'moments');

-- 允许有效令牌上传
CREATE POLICY "Authenticated upload with token"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'moments' AND
  EXISTS (
    SELECT 1 FROM upload_tokens
    WHERE id = (current_setting('request.headers', true)::json->>'x-upload-token')::uuid
    AND expires_at > now()
  )
);
```

## 实施步骤

### Phase 1: 数据库迁移（不影响现有功能）
1. 创建 `operations` 和 `upload_tokens` 表
2. 部署 Supabase 迁移
3. 验证表创建成功

### Phase 2: 实现新同步逻辑（并行运行）
1. 实现 `realtimeSync.ts` 和 `operations.ts`
2. 添加功能开关，允许切换新旧同步
3. 本地测试新同步逻辑

### Phase 3: 照片上传优化
1. 实现 `upload-token.mjs`
2. 配置 Storage Policy
3. 修改前端直连 Storage

### Phase 4: 灰度切换
1. 默认启用新同步，保留降级开关
2. 监控错误率和同步延迟
3. 观察 1-2 天无问题后移除旧代码

### Phase 5: 清理
1. 删除 `shared_app_state` 多行结构
2. 删除 pending operations localStorage
3. 删除轮询相关代码
4. 更新文档

## 预期收益

- ⚡ **实时同步**：Realtime 推送延迟 < 1 秒，取代 5 秒轮询
- 📉 **请求减少 90%**：单次读取全量数据 + 增量操作推送
- 🔒 **冲突减少**：操作日志自动合并，409 错误几乎消失
- 📸 **上传提速 50%**：直连 Storage，无 Function 转发损耗
- 🕐 **历史可查**：保留所有操作记录，支持审计和恢复
- 💾 **离线友好**：操作队列在数据库中，不依赖 localStorage

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Realtime 连接不稳定 | 同步延迟 | 断线时自动回退到短轮询（30秒） |
| Operations 表增长过快 | 查询变慢 | 定期归档超过 7 天的已应用操作 |
| Storage Policy 令牌验证失败 | 上传失败 | 降级到 Function 转发模式 |
| 数据迁移丢失 | 数据损失 | 迁移前完整备份，灰度切换保留旧表 |

## 后续优化方向

1. **离线模式**：Service Worker 缓存 + 本地 IndexedDB 完整副本
2. **操作压缩**：前端批量提交多个操作，减少写入
3. **分页加载**：照片墙、留言板等大列表按需加载
4. **冲突提示**：检测到其他设备修改时，UI 高亮提示用户
5. **数据统计**：操作日志支持生成时光轴、活跃度等可视化
