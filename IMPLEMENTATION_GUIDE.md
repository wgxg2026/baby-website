# 云端同步重构实施指南

## 📋 概述

本指南指导你完成云端同步架构的重构，从当前的**轮询 + 乐观锁**模式切换到**Realtime + 操作日志**模式。

## ⚠️ 重要提示

- **不要急于删除旧代码**：新旧系统将并行运行一段时间
- **灰度切换**：先在一台设备上测试，确认无误后再全面启用
- **数据备份**：执行迁移前务必备份 Supabase 数据

## 🚀 实施步骤

### Phase 1: 数据库迁移（30分钟）

#### 1.1 备份当前数据

在 Supabase Dashboard 执行：

```sql
-- 导出当前数据作为备份
CREATE TABLE shared_app_state_backup AS SELECT * FROM shared_app_state;
```

#### 1.2 执行迁移脚本

1. 打开 Supabase Dashboard → SQL Editor
2. 复制 `supabase/migrations/002_refactor_sync.sql` 的全部内容
3. 执行脚本（约30秒）
4. 验证表创建：

```sql
-- 检查新表
SELECT * FROM app_state_v2 WHERE id = 'default';
SELECT COUNT(*) FROM operations;
SELECT COUNT(*) FROM upload_tokens;

-- 验证数据已迁移
SELECT 
  jsonb_array_length(data->'messages') as messages_count,
  jsonb_array_length(data->'moments') as moments_count,
  version
FROM app_state_v2 WHERE id = 'default';
```

#### 1.3 配置 Realtime

1. Supabase Dashboard → Database → Replication
2. 启用 `operations` 表的 Realtime：
   - 找到 `operations` 表
   - 勾选 `Enable Realtime`
   - 点击保存

#### 1.4 配置定期任务（可选但推荐）

如果你的 Supabase 项目启用了 `pg_cron` 扩展：

```sql
-- 启用扩展
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 每10秒合并操作
SELECT cron.schedule(
  'apply-operations',
  '10 seconds',
  'SELECT apply_pending_operations()'
);

-- 每小时清理过期令牌
SELECT cron.schedule(
  'cleanup-tokens',
  '0 * * * *',
  'SELECT cleanup_expired_tokens()'
);
```

如果未启用 pg_cron，Function 会在每次提交操作时触发合并。

---

### Phase 2: 更新 Netlify 配置（10分钟）

#### 2.1 更新路由配置

编辑 `netlify.toml`，添加新的路由：

```toml
[build]
  command = "pnpm build"
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

# 新路由：操作日志 API
[[redirects]]
  from = "/api/operations"
  to = "/.netlify/functions/operations"
  status = 200

# 新路由：主数据 API
[[redirects]]
  from = "/api/app-state"
  to = "/.netlify/functions/app-state"
  status = 200

# 新路由：上传令牌
[[redirects]]
  from = "/api/upload-token"
  to = "/.netlify/functions/upload-token"
  status = 200

# 新路由：照片上传
[[redirects]]
  from = "/api/photo-upload"
  to = "/.netlify/functions/photo-upload"
  status = 200

# 保留旧路由（向后兼容）
[[redirects]]
  from = "/api/cloud-state"
  to = "/.netlify/functions/cloud-state"
  status = 200

[[redirects]]
  from = "/api/moment-upload"
  to = "/.netlify/functions/moment-upload"
  status = 200

[[redirects]]
  from = "/api/moment-image/*"
  to = "/.netlify/functions/moment-image?path=:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### 2.2 部署 Functions

```powershell
cd 'C:\Users\qunhuiwu\Desktop\和宝宝的小网站'

# 本地测试
pnpm dev:netlify

# 访问测试端点（在另一个终端）
curl http://localhost:8888/api/app-state
curl http://localhost:8888/api/operations?since=0

# 构建并部署
pnpm build
git add netlify.toml netlify/functions/*.mjs supabase/migrations/*.sql
git commit -m "feat: 重构云端同步架构（Realtime + 操作日志）"
git push
```

#### 2.3 验证 Netlify 部署

1. 打开 Netlify Dashboard
2. 等待构建完成
3. 测试新端点：
   - `https://你的站点.netlify.app/api/app-state`
   - `https://你的站点.netlify.app/api/operations?since=0`

---

### Phase 3: 前端集成（30分钟）

#### 3.1 添加环境变量

编辑 `.env`，确保包含：

```env
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_ANON_KEY=你的anon-key
```

#### 3.2 修改 vite.config.ts

确保环境变量正确传递：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL),
    'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY),
  },
})
```

#### 3.3 创建功能开关

在 `src/lib/localStore.ts` 中添加：

```typescript
const FEATURE_FLAGS_KEY = "couple-time-capsule-feature-flags";

export interface FeatureFlags {
  useRealtimeSync: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  try {
    const stored = localStorage.getItem(FEATURE_FLAGS_KEY);
    return stored ? JSON.parse(stored) : { useRealtimeSync: false };
  } catch {
    return { useRealtimeSync: false };
  }
}

export function setFeatureFlag(flag: keyof FeatureFlags, value: boolean) {
  const flags = getFeatureFlags();
  flags[flag] = value;
  localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(flags));
}
```

#### 3.4 修改 App.tsx 集成新同步

在 `src/App.tsx` 中，找到数据初始化部分并添加新同步逻辑：

```typescript
// 在文件顶部导入
import { RealtimeSyncManager } from "./lib/realtimeSync";
import { getFeatureFlags } from "./lib/localStore";

// 在组件内部添加
const [syncManager] = useState(() => new RealtimeSyncManager());

useEffect(() => {
  const flags = getFeatureFlags();
  
  if (flags.useRealtimeSync) {
    // 使用新同步
    syncManager.initialize((data, state) => {
      setData(data);
      setCloudStatus(state.status === "connected" ? "saved" : state.status);
      if (state.errorMessage) {
        setCloudError(state.errorMessage);
      }
    });

    return () => syncManager.disconnect();
  } else {
    // 使用旧同步（保持现有逻辑）
    // ... 现有的 initializeCloudData 逻辑
  }
}, []);

// 修改数据更新逻辑
const updateData = useCallback((newData: AppData) => {
  const flags = getFeatureFlags();
  
  if (flags.useRealtimeSync) {
    void syncManager.applyLocalChange(newData);
  } else {
    // 旧逻辑
    setData(newData);
    saveLocalData(newData);
    // ... 现有的 pending operations 逻辑
  }
}, [syncManager]);
```

---

### Phase 4: 灰度测试（1-2天）

#### 4.1 启用新同步

在浏览器控制台执行：

```javascript
localStorage.setItem('couple-time-capsule-feature-flags', JSON.stringify({useRealtimeSync: true}));
location.reload();
```

#### 4.2 测试清单

- [ ] 页面加载，数据正常显示
- [ ] 添加一条留言，另一台设备秒级收到
- [ ] 添加照片，上传成功并显示
- [ ] 删除记录，另一台设备同步删除
- [ ] 断网后修改，恢复网络后自动同步
- [ ] 刷新页面，数据保持最新
- [ ] 两台设备同时编辑，无冲突或自动合并

#### 4.3 监控指标

在浏览器控制台查看日志：

```javascript
// 查看同步状态
console.log('[Sync] Status:', syncManager.getState());

// 查看 Realtime 连接
console.log('[Realtime] 已连接'); // 应该出现此日志
```

#### 4.4 回滚方案

如果出现问题，立即回滚：

```javascript
localStorage.setItem('couple-time-capsule-feature-flags', JSON.stringify({useRealtimeSync: false}));
location.reload();
```

---

### Phase 5: 全面切换（第3天）

#### 5.1 确认无误后，默认启用新同步

修改 `src/lib/localStore.ts`：

```typescript
export function getFeatureFlags(): FeatureFlags {
  try {
    const stored = localStorage.getItem(FEATURE_FLAGS_KEY);
    return stored ? JSON.parse(stored) : { useRealtimeSync: true }; // 默认启用
  } catch {
    return { useRealtimeSync: true };
  }
}
```

#### 5.2 清理旧代码（1周后）

确认新系统稳定运行一周后，删除：

- `src/lib/sharedCloud.ts` 中的轮询逻辑
- `netlify/functions/cloud-state.mjs` 的写入逻辑（保留读取用于数据恢复）
- `netlify/functions/moment-upload.mjs`（照片改用 photo-upload）
- localStorage 中的 `couple-time-capsule-pending-ops`

#### 5.3 归档旧数据表

```sql
-- 一个月后，确认无问题时归档旧表
ALTER TABLE shared_app_state RENAME TO shared_app_state_deprecated_20260928;
```

---

## 🔧 故障排查

### 问题1：Realtime 连接失败

**症状**：控制台没有 `[Realtime] 已连接` 日志

**解决**：
1. 检查 Supabase Dashboard → Database → Replication，确认 `operations` 表已启用
2. 检查 `.env` 中的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 是否正确
3. 检查浏览器网络面板，查看 WebSocket 连接是否被阻止

### 问题2：操作提交失败

**症状**：修改数据后，控制台报错 `[Sync] 提交操作失败`

**解决**：
1. 检查 Netlify 环境变量是否配置
2. 检查 Supabase 的 `operations` 表 RLS 策略是否启用
3. 查看 Netlify Function 日志

### 问题3：照片上传失败

**症状**：上传照片后返回 401 错误

**解决**：
1. 检查 `upload_tokens` 表是否创建成功
2. 确认 Storage Policy 已配置（迁移脚本中的注释部分）
3. 尝试先生成令牌：`curl -X POST https://你的站点.netlify.app/api/upload-token`

### 问题4：数据不同步

**症状**：一台设备的修改未推送到另一台

**解决**：
1. 检查两台设备的 `client_id` 是否不同（控制台执行 `localStorage.getItem('couple-time-capsule-client-id-v2')`）
2. 检查 Realtime 是否正常连接
3. 手动触发拉取：在控制台执行 `syncManager.pullMissingOperations()`

---

## 📊 性能对比

| 指标 | 旧架构 | 新架构 | 改进 |
|------|--------|--------|------|
| 同步延迟 | 5秒（轮询） | <1秒（Realtime） | **5倍提升** |
| 每分钟请求数 | 12次（5秒轮询） | 0-2次（按需） | **减少90%** |
| 冲突频率 | 经常（409错误） | 极少（自动合并） | **几乎消除** |
| 照片上传耗时 | 3-5秒（双重转发） | 1-2秒（直连） | **50%提升** |

---

## ✅ 验收标准

- [ ] 数据库迁移完成，无数据丢失
- [ ] Realtime 连接稳定，延迟 <1 秒
- [ ] 两台设备同时编辑无冲突
- [ ] 照片上传成功率 >99%
- [ ] 断网后恢复自动同步
- [ ] 无 409 冲突错误
- [ ] 前端控制台无报错

---

## 📞 支持

如果遇到问题，按以下顺序排查：

1. 查看本文档的「故障排查」部分
2. 检查浏览器控制台日志
3. 检查 Netlify Function 日志
4. 检查 Supabase Dashboard → Logs
5. 回滚到旧架构并报告问题

---

**预计总耗时**：2-3小时（不包括灰度观察期）

**风险等级**：中等（有完整回滚方案）

**收益**：显著提升同步体验，降低冲突率，减少服务器负载
