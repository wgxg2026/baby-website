# ============================================
# 一键修复 409 错误
# ============================================
#
# 这个脚本会：
# 1. 提交所有更改到 Git
# 2. 推送到远程仓库（触发 Netlify 部署）
# 3. 提供清晰的后续步骤指引
#
# ⚠️ 运行前提：
# - 你已经在 Supabase Dashboard 执行了数据库迁移
# - 你已经启用了 operations 表的 Realtime
#
# ============================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🚀 一键修复 409 错误" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否在正确的目录
if (-not (Test-Path ".\src\App.tsx")) {
    Write-Host "❌ 错误：请在项目根目录运行此脚本" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "⚠️  重要提醒：" -ForegroundColor Yellow
Write-Host ""
Write-Host "在继续之前，请确认以下步骤已完成：" -ForegroundColor White
Write-Host ""
Write-Host "  [ ] 1. 已在 Supabase Dashboard 执行数据库迁移" -ForegroundColor Gray
Write-Host "         路径：SQL Editor → 粘贴 supabase/migrations/002_refactor_sync.sql → RUN" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  [ ] 2. 已启用 operations 表的 Realtime" -ForegroundColor Gray
Write-Host "         路径：Database → Replication → operations → ✓ Enable Realtime" -ForegroundColor DarkGray
Write-Host ""

$confirm = Read-Host "✅ 以上步骤都已完成？(y/n)"

if ($confirm -ne "y") {
    Write-Host ""
    Write-Host "⏸️  操作已取消" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📖 请先完成以上步骤，然后再运行此脚本。" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 如需帮助，查看：DEPLOY_NOW.md" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "🚀 开始修复..." -ForegroundColor Green
Write-Host ""

# ============================================
# Step 1: 检查 Git 状态
# ============================================
Write-Host "[1/4] 🔍 检查 Git 状态..." -ForegroundColor Cyan

try {
    $gitStatus = git status --porcelain 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Git 检查失败"
    }
} catch {
    Write-Host ""
    Write-Host "❌ Git 不可用或当前目录不是 Git 仓库" -ForegroundColor Red
    Write-Host ""
    Write-Host "请确保：" -ForegroundColor White
    Write-Host "  1. 已安装 Git" -ForegroundColor Gray
    Write-Host "  2. 当前目录是 Git 仓库（git init）" -ForegroundColor Gray
    Write-Host "  3. 已关联远程仓库（git remote add origin ...）" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

if ([string]::IsNullOrWhiteSpace($gitStatus)) {
    Write-Host "  ℹ️  工作目录干净，没有新的更改需要提交" -ForegroundColor Yellow
    Write-Host ""

    $forcePush = Read-Host "是否继续推送到远程仓库？(y/n)"
    if ($forcePush -ne "y") {
        Write-Host ""
        Write-Host "⏸️  操作已取消" -ForegroundColor Yellow
        Write-Host ""
        exit 0
    }
} else {
    Write-Host "  ✅ 发现未提交的更改" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# Step 2: 提交更改
# ============================================
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    Write-Host "[2/4] 📦 提交更改到 Git..." -ForegroundColor Cyan

    try {
        git add . 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "git add 失败"
        }

        $commitMessage = "feat: 修复云端同步 409 冲突

- 新增实时同步架构（Realtime + 操作日志）
- 保留旧架构作为兼容模式（默认）
- 新增功能开关系统
- 优化数据库结构（app_state_v2 + operations）
- 改进照片上传流程"

        git commit -m $commitMessage 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "git commit 失败"
        }

        Write-Host "  ✅ 提交成功" -ForegroundColor Green
        Write-Host ""
    } catch {
        Write-Host ""
        Write-Host "❌ Git 提交失败：$_" -ForegroundColor Red
        Write-Host ""
        exit 1
    }
} else {
    Write-Host "[2/4] ⏭️  跳过提交（没有新更改）" -ForegroundColor Yellow
    Write-Host ""
}

# ============================================
# Step 3: 推送到远程
# ============================================
Write-Host "[3/4] 🌐 推送到远程仓库..." -ForegroundColor Cyan

try {
    $pushOutput = git push 2>&1
    if ($LASTEXITCODE -ne 0) {
        # 可能是首次推送，尝试设置上游分支
        $currentBranch = git branch --show-current 2>&1
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($currentBranch)) {
            Write-Host "  ℹ️  尝试设置上游分支..." -ForegroundColor Yellow
            git push -u origin $currentBranch 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "推送失败"
            }
        } else {
            throw "推送失败"
        }
    }

    Write-Host "  ✅ 推送成功" -ForegroundColor Green
    Write-Host "  ℹ️  Netlify 将自动开始部署" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host ""
    Write-Host "❌ 推送失败：$_" -ForegroundColor Red
    Write-Host ""
    Write-Host "请检查：" -ForegroundColor White
    Write-Host "  1. 远程仓库地址是否正确（git remote -v）" -ForegroundColor Gray
    Write-Host "  2. 是否有推送权限" -ForegroundColor Gray
    Write-Host "  3. 网络连接是否正常" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# ============================================
# Step 4: 等待部署
# ============================================
Write-Host "[4/4] ⏳ 等待 Netlify 部署..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  📍 请打开 Netlify Dashboard 查看部署进度：" -ForegroundColor White
Write-Host "     https://app.netlify.com/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  预计部署时间：1-2 分钟" -ForegroundColor Gray
Write-Host ""

$deployed = Read-Host "✅ 部署已完成？(y/n)"

if ($deployed -ne "y") {
    Write-Host ""
    Write-Host "⏸️  请等待部署完成后，再继续后续步骤" -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# ============================================
# 部署完成 - 测试指南
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ 部署成功！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "🎯 下一步：启用新架构（灰度测试）" -ForegroundColor Cyan
Write-Host ""
Write-Host "现在新旧架构并存，默认使用旧架构（仍有 409 错误）。" -ForegroundColor White
Write-Host "你需要手动启用新架构来修复 409 问题。" -ForegroundColor White
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "📱 方式 1：单设备测试（推荐）" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. 打开你的网站（生产地址）" -ForegroundColor White
Write-Host ""
Write-Host "  2. 按 F12 打开浏览器控制台（Console 标签）" -ForegroundColor White
Write-Host ""
Write-Host "  3. 输入并回车：" -ForegroundColor White
Write-Host "     window.__enableRealtimeSync()" -ForegroundColor Cyan
Write-Host ""
Write-Host "  4. 刷新页面（F5）" -ForegroundColor White
Write-Host ""
Write-Host "  5. 验证日志（应该看到）：" -ForegroundColor White
Write-Host "     [App] 启用实时同步架构" -ForegroundColor Green
Write-Host "     [Realtime] 已连接" -ForegroundColor Green
Write-Host ""
Write-Host "  6. 测试功能：" -ForegroundColor White
Write-Host "     • 添加/编辑/删除数据" -ForegroundColor Gray
Write-Host "     • 打开多个标签页测试同步" -ForegroundColor Gray
Write-Host "     • 确认不再有 409 错误 ✅" -ForegroundColor Gray
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "🌍 方式 2：全面启用（测试通过后）" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Netlify Dashboard → Site settings → Environment variables" -ForegroundColor White
Write-Host ""
Write-Host "  2. 添加新变量：" -ForegroundColor White
Write-Host "     Key:   VITE_ENABLE_REALTIME_SYNC" -ForegroundColor Cyan
Write-Host "     Value: true" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Deploys → Trigger deploy → Deploy site" -ForegroundColor White
Write-Host ""
Write-Host "  4. 等待部署完成（1-2分钟）" -ForegroundColor White
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "🔍 如何验证成功？" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ✅ 不再有 409 错误" -ForegroundColor Green
Write-Host "  ✅ 同步延迟 < 1 秒" -ForegroundColor Green
Write-Host "  ✅ 网络请求大幅减少（F12 → Network 标签）" -ForegroundColor Green
Write-Host "  ✅ 控制台显示 [Realtime] 已连接" -ForegroundColor Green
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "🛠️  如果遇到问题？" -ForegroundColor Cyan
Write-Host ""
Write-Host "  立即回退到旧架构（控制台输入）：" -ForegroundColor White
Write-Host "  window.__disableRealtimeSync()" -ForegroundColor Yellow
Write-Host ""
Write-Host "  然后刷新页面，会回到旧架构（有 409 但功能正常）" -ForegroundColor Gray
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "📚 更多帮助：" -ForegroundColor Cyan
Write-Host ""
Write-Host "  • DEPLOY_NOW.md - 详细部署指南" -ForegroundColor Gray
Write-Host "  • IMPLEMENTATION_GUIDE.md - 完整实施文档" -ForegroundColor Gray
Write-Host "  • CHECKLIST.md - 检查清单" -ForegroundColor Gray
Write-Host ""
Write-Host "🎉 祝修复顺利！" -ForegroundColor Green
Write-Host ""
