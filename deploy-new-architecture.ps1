# ============================================
# 情侣时光网站 - 新架构一键部署脚本
# ============================================
#
# 功能：自动完成数据库迁移、代码部署、功能开关启用
#
# 使用前提：
# 1. 已在 Supabase Dashboard 手动执行 002_refactor_sync.sql
# 2. 已在 Netlify 配置环境变量 SUPABASE_URL 和 SUPABASE_ANON_KEY
# 3. Git 仓库已关联到 Netlify
#
# ============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  情侣时光网站 - 新架构部署向导" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查当前目录
if (-not (Test-Path ".\src\App.tsx")) {
    Write-Host "❌ 错误：请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

Write-Host "📋 部署检查清单：" -ForegroundColor Yellow
Write-Host ""
Write-Host "  [ ] 1. 已在 Supabase Dashboard 执行数据库迁移" -ForegroundColor Gray
Write-Host "      → 打开 Supabase Dashboard → SQL Editor" -ForegroundColor Gray
Write-Host "      → 复制 supabase/migrations/002_refactor_sync.sql 全部内容" -ForegroundColor Gray
Write-Host "      → 点击 RUN 执行" -ForegroundColor Gray
Write-Host ""
Write-Host "  [ ] 2. 已在 Supabase Database 启用 Realtime" -ForegroundColor Gray
Write-Host "      → Database → Replication → 找到 operations 表" -ForegroundColor Gray
Write-Host "      → 勾选 ✓ 启用" -ForegroundColor Gray
Write-Host ""
Write-Host "  [ ] 3. Netlify 环境变量已配置" -ForegroundColor Gray
Write-Host "      → SUPABASE_URL" -ForegroundColor Gray
Write-Host "      → SUPABASE_ANON_KEY" -ForegroundColor Gray
Write-Host ""

$confirm = Read-Host "✅ 以上步骤都已完成？(y/n)"
if ($confirm -ne "y") {
    Write-Host "❌ 部署取消。请先完成上述步骤。" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "🚀 开始部署..." -ForegroundColor Green
Write-Host ""

# ============================================
# Step 1: Git 提交所有变更
# ============================================
Write-Host "[1/3] 📦 提交代码到 Git..." -ForegroundColor Cyan

git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Git add 失败" -ForegroundColor Red
    exit 1
}

$commitMsg = "feat: 重构云端同步架构 - Realtime + 操作日志

- 新增 app_state_v2 单一数据表
- 新增 operations 操作日志表
- 新增实时同步管理器 RealtimeSyncManager
- 新增功能开关系统（默认关闭，兼容旧架构）
- 优化照片上传流程（令牌 + 直连）
- 解决 409 冲突问题"

git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  没有变更需要提交，或提交失败" -ForegroundColor Yellow
}

Write-Host "✅ 代码提交完成" -ForegroundColor Green
Write-Host ""

# ============================================
# Step 2: 推送到远程仓库（触发 Netlify 自动部署）
# ============================================
Write-Host "[2/3] 🌐 推送到远程仓库..." -ForegroundColor Cyan

git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Git push 失败，请检查网络或仓库权限" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 代码已推送，Netlify 将自动部署" -ForegroundColor Green
Write-Host ""

# ============================================
# Step 3: 等待部署完成
# ============================================
Write-Host "[3/3] ⏳ 等待 Netlify 部署..." -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 请在浏览器中打开：https://app.netlify.com/" -ForegroundColor Yellow
Write-Host "   → 找到你的站点 → Deploys 标签" -ForegroundColor Gray
Write-Host "   → 等待部署状态变为 ✅ Published" -ForegroundColor Gray
Write-Host ""

$waitConfirm = Read-Host "✅ 部署已完成？(y/n)"
if ($waitConfirm -ne "y") {
    Write-Host "⚠️  部署未完成，请稍后手动验证。" -ForegroundColor Yellow
    exit 0
}

# ============================================
# 部署完成 - 下一步指南
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ 部署成功！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 下一步：启用新架构（灰度测试）" -ForegroundColor Cyan
Write-Host ""
Write-Host "方式 1️⃣：浏览器控制台测试（推荐）" -ForegroundColor Yellow
Write-Host "  1. 打开你的网站" -ForegroundColor Gray
Write-Host "  2. 按 F12 打开开发者工具 → Console" -ForegroundColor Gray
Write-Host "  3. 输入：window.__enableRealtimeSync()" -ForegroundColor Gray
Write-Host "  4. 刷新页面" -ForegroundColor Gray
Write-Host "  5. 观察控制台日志：应该看到 [App] 启用实时同步架构" -ForegroundColor Gray
Write-Host ""
Write-Host "方式 2️⃣：Netlify 环境变量（全面启用）" -ForegroundColor Yellow
Write-Host "  1. Netlify Dashboard → Site settings → Environment variables" -ForegroundColor Gray
Write-Host "  2. 添加变量：VITE_ENABLE_REALTIME_SYNC = true" -ForegroundColor Gray
Write-Host "  3. 触发重新部署：Deploys → Trigger deploy → Deploy site" -ForegroundColor Gray
Write-Host ""
Write-Host "🔍 验证方式：" -ForegroundColor Cyan
Write-Host "  • 不再有 409 错误" -ForegroundColor Gray
Write-Host "  • 多设备同步延迟 < 1 秒" -ForegroundColor Gray
Write-Host "  • 控制台日志显示：[Realtime] 已连接" -ForegroundColor Gray
Write-Host ""
Write-Host "🛠️  如果遇到问题：" -ForegroundColor Cyan
Write-Host "  • 回退到旧架构：window.__disableRealtimeSync()" -ForegroundColor Gray
Write-Host "  • 查看日志：supabase/migrations/002_refactor_sync.sql 是否执行成功" -ForegroundColor Gray
Write-Host "  • 检查 Realtime：operations 表是否启用 Replication" -ForegroundColor Gray
Write-Host ""
Write-Host "📚 详细文档：" -ForegroundColor Cyan
Write-Host "  • QUICKSTART.md - 快速上手" -ForegroundColor Gray
Write-Host "  • IMPLEMENTATION_GUIDE.md - 实施指南" -ForegroundColor Gray
Write-Host "  • CHECKLIST.md - 完整检查清单" -ForegroundColor Gray
Write-Host ""
Write-Host "🎉 祝重构顺利！" -ForegroundColor Green
