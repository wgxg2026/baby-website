# 重构检查清单

在开始实施前，请逐项确认以下内容：

## ✅ 前置准备

### 数据备份
- [ ] 已在 Supabase 中创建 `shared_app_state_backup` 表
- [ ] 已导出当前 Netlify 站点配置（截图或复制）
- [ ] 已保存 `.env` 文件的副本

### 环境验证
- [ ] Supabase 项目可以正常访问
- [ ] Netlify 站点可以正常访问
- [ ] 本地开发环境可以运行 `pnpm dev`
- [ ] Git 仓库状态干净（无未提交修改）

### 工具准备
- [ ] 可以访问 Supabase Dashboard
- [ ] 可以访问 Netlify Dashboard
- [ ] 有至少两台设备用于测试（电脑 + 手机）
- [ ] 浏览器开发者工具会用

## 📋 新文件清单

### 数据库文件
- [x] `supabase/migrations/002_refactor_sync.sql` - 已创建

### 前端核心库
- [x] `src/lib/operations.ts` - 已创建
- [x] `src/lib/realtimeSync.ts` - 已创建

### Netlify Functions
- [x] `netlify/functions/app-state.mjs` - 已创建
- [x] `netlify/functions/operations.mjs` - 已创建
- [x] `netlify/functions/upload-token.mjs` - 已创建
- [x] `netlify/functions/photo-upload.mjs` - 已创建

### 文档
- [x] `REFACTOR_PLAN.md` - 已创建
- [x] `IMPLEMENTATION_GUIDE.md` - 已创建
- [x] `ARCHITECTURE_SUMMARY.md` - 已创建
- [x] `QUICKSTART.md` - 已创建
- [x] `CHECKLIST.md` - 本文件

## 🔧 需要修改的文件

### 必须修改
- [ ] `netlify.toml` - 添加新的 API 路由
- [ ] `src/lib/localStore.ts` - 添加功能开关
- [ ] `src/App.tsx` - 集成新同步逻辑

### 建议修改
- [ ] `vite.config.ts` - 确保环境变量传递
- [ ] `.gitignore` - 确保不提交敏感文件

## 🚀 实施阶段

### Phase 1: 数据库迁移 ⏱️ 30分钟
- [ ] 创建备份表
- [ ] 执行迁移脚本
- [ ] 验证表创建成功
- [ ] 启用 operations 表的 Realtime
- [ ] 配置 pg_cron（可选）

### Phase 2: Netlify 配置 ⏱️ 10分钟
- [ ] 更新 netlify.toml
- [ ] 验证新 Functions 文件存在
- [ ] 本地测试 `pnpm dev:netlify`（可选）
- [ ] 提交代码到 Git
- [ ] 推送到 GitHub 触发 Netlify 部署
- [ ] 等待部署完成
- [ ] 测试新端点可访问

### Phase 3: 前端集成 ⏱️ 30分钟
- [ ] 添加功能开关代码到 localStore.ts
- [ ] 修改 App.tsx 集成新同步
- [ ] 本地测试功能开关
- [ ] 提交并部署

### Phase 4: 灰度测试 ⏱️ 1-2天
- [ ] 在一台设备启用新同步
- [ ] 验证 Realtime 连接成功
- [ ] 测试添加留言
- [ ] 测试上传照片
- [ ] 测试删除记录
- [ ] 测试断网恢复
- [ ] 两台设备交叉测试
- [ ] 监控控制台日志
- [ ] 监控 Netlify Function 日志
- [ ] 记录任何异常

### Phase 5: 全面切换 ⏱️ 1周
- [ ] 灰度测试通过
- [ ] 修改默认开关为启用
- [ ] 部署到生产环境
- [ ] 通知用户清除缓存（如需要）
- [ ] 持续监控1周
- [ ] 无问题后清理旧代码
- [ ] 归档旧数据表

## 🧪 测试用例

### 基础功能
- [ ] 页面加载正常，数据正确显示
- [ ] 添加留言成功
- [ ] 删除留言成功
- [ ] 留言回复成功
- [ ] 上传照片成功
- [ ] 删除照片成功

### 同步测试
- [ ] 设备A修改 → 设备B实时显示（<1秒）
- [ ] 设备B修改 → 设备A实时显示（<1秒）
- [ ] 两设备同时修改 → 自动合并无冲突

### 异常场景
- [ ] 断网后修改 → 恢复后自动同步
- [ ] 刷新页面 → 数据保持最新
- [ ] 长时间不活跃 → 重新连接正常
- [ ] Realtime 断开 → 降级到轮询

### 性能测试
- [ ] 首次加载时间 < 3秒
- [ ] 同步延迟 < 1秒
- [ ] 照片上传成功率 > 99%
- [ ] 无频繁的网络请求（< 2次/分钟）

## ⚠️ 风险检查

### 数据安全
- [ ] 已备份所有数据
- [ ] 迁移脚本不会删除旧表
- [ ] 有完整的回滚方案
- [ ] 敏感信息未提交到 Git

### 兼容性
- [ ] 新旧系统可以并行运行
- [ ] 功能开关可以随时切换
- [ ] 旧代码不会影响新代码

### 监控
- [ ] 知道如何查看 Netlify 日志
- [ ] 知道如何查看 Supabase 日志
- [ ] 知道如何查看浏览器控制台
- [ ] 知道如何回滚到旧版本

## 📊 成功指标

### 上线后第1天
- [ ] 无严重错误（5xx 错误）
- [ ] Realtime 连接稳定性 > 95%
- [ ] 用户无抱怨

### 上线后第3天
- [ ] 同步延迟平均 < 1秒
- [ ] 照片上传成功率 > 99%
- [ ] 无 409 冲突错误

### 上线后第7天
- [ ] 所有功能正常
- [ ] 性能指标达标
- [ ] 可以清理旧代码

## 🆘 应急预案

### 如果迁移失败
1. 停止执行后续步骤
2. 删除新建的表：`DROP TABLE operations; DROP TABLE upload_tokens; DROP TABLE app_state_v2;`
3. 从备份恢复：`INSERT INTO shared_app_state SELECT * FROM shared_app_state_backup;`
4. 检查错误日志，确定问题原因

### 如果 Realtime 无法连接
1. 先部署 Functions，使用轮询降级
2. 检查 Supabase Replication 设置
3. 联系 Supabase 支持

### 如果用户报告问题
1. 立即回滚功能开关
2. 收集错误信息（控制台截图）
3. 分析问题原因
4. 修复后再次测试

### 如果数据出现异常
1. 立即停止新同步
2. 从 operations 表恢复操作历史
3. 手动合并冲突数据
4. 验证数据完整性后恢复服务

## 📞 支持联系方式

- **Supabase 文档**: https://supabase.com/docs
- **Netlify 文档**: https://docs.netlify.com
- **项目交接文档**: `PROJECT_HANDOFF.md`
- **实施指南**: `IMPLEMENTATION_GUIDE.md`

## ✍️ 记录

### 实施日期
- 开始时间：_____年_____月_____日 _____:_____
- 完成时间：_____年_____月_____日 _____:_____

### 参与人员
- 执行人：________________
- 验证人：________________

### 问题记录
```
问题1：
解决方案：
状态：已解决 / 待解决

问题2：
解决方案：
状态：已解决 / 待解决
```

### 最终状态
- [ ] 重构成功，新架构运行正常
- [ ] 部分成功，有小问题需要解决
- [ ] 失败，已回滚到旧架构

---

**建议时间安排**：
- 周五晚上：执行 Phase 1-3（准备工作）
- 周六：Phase 4 灰度测试
- 下周一：Phase 5 全面切换

**关键提醒**：
- 每个阶段完成后都要验证
- 遇到问题先查文档，再尝试回滚
- 保持冷静，数据有备份
