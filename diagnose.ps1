# ============================================
# 情侣时光网站 - 故障诊断脚本
# ============================================
#
# 功能：自动检测当前架构状态和问题原因
#
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🔍 故障诊断工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查当前目录
if (-not (Test-Path ".\src\App.tsx")) {
    Write-Host "❌ 错误：请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

$issues = @()
$warnings = @()

Write-Host "🔍 正在检查项目状态..." -ForegroundColor Yellow
Write-Host ""

# ============================================
# Check 1: 检查新架构文件是否存在
# ============================================
Write-Host "[1/7] 检查新架构文件..." -ForegroundColor Cyan

$requiredFiles = @(
    "src\lib\realtimeSync.ts",
    "src\lib\operations.ts",
    "src\lib\featureFlags.ts",
    "netlify\functions\app-state.mjs",
    "netlify\functions\operations.mjs",
    "supabase\migrations\002_refactor_sync.sql"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "  ❌ 缺失关键文件：" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "     • $file" -ForegroundColor Red
    }
    $issues += "缺失新架构文件"
} else {
    Write-Host "  ✅ 所有新架构文件已就绪" -ForegroundColor Green
}
Write-Host ""

# ============================================
# Check 2: 检查功能开关状态
# ============================================
Write-Host "[2/7] 检查功能开关状态..." -ForegroundColor Cyan

$featureFlagContent = Get-Content "src\lib\featureFlags.ts" -Raw
if ($featureFlagContent -match "return false") {
    Write-Host "  ⚠️  新架构功能开关默认关闭（预期行为）" -ForegroundColor Yellow
    Write-Host "     → 当前使用旧架构，这是 409 错误的根源" -ForegroundColor Yellow
    $warnings += "新架构未启用"
} else {
    Write-Host "  ✅ 功能开关配置正确" -ForegroundColor Green
}
Write-Host ""

# ============================================
# Check 3: 检查旧架构文件
# ============================================
Write-Host "[3/7] 检查旧架构文件..." -ForegroundColor Cyan

if (Test-Path "netlify\functions\cloud-state.mjs") {
    $cloudStateContent = Get-Content "netlify\functions\cloud-state.mjs" -Raw
    if ($cloudStateContent -match "409.*CONFLICT") {
        Write-Host "  ⚠️  旧架构 cloud-state.mjs 仍存在" -ForegroundColor Yellow
        Write-Host "     → 这是 409 错误的来源（乐观锁冲突）" -ForegroundColor Yellow
        Write-Host "     → 部署后可以删除此文件" -ForegroundColor Gray
        $warnings += "旧架构文件未删除"
    }
} else {
    Write-Host "  ✅ 旧架构文件已清理" -ForegroundColor Green
}
Write-Host ""

# ============================================
# Check 4: 检查 Git 状态
# ============================================
Write-Host "[4/7] 检查 Git 状态..." -ForegroundColor Cyan

$gitStatus = git status --porcelain 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠️  不是 Git 仓库或 Git 未安装" -ForegroundColor Yellow
    $warnings += "Git 状态检查失败"
} elseif ($gitStatus) {
    Write-Host "  ⚠️  有未提交的更改：" -ForegroundColor Yellow
    $changes = $gitStatus -split "`n" | Select-Object -First 5
    foreach ($change in $changes) {
        Write-Host "     $change" -ForegroundColor Gray
    }
    if ($gitStatus.Count -gt 5) {
        Write-Host "     ... 还有 $($gitStatus.Count - 5) 个文件" -ForegroundColor Gray
    }
    Write-Host "     → 需要运行 deploy-new-architecture.ps1 提交并部署" -ForegroundColor Yellow
    $warnings += "有未提交的更改"
} else {
    Write-Host "  ✅ 工作目录干净" -ForegroundColor Green
}
Write-Host ""

# ============================================
# Check 5: 检查环境变量配置文件
# ============================================
Write-Host "[5/7] 检查环境变量配置..." -ForegroundColor Cyan

$envFiles = @(".env", ".env.local", ".env.production")
$foundEnv = $false

foreach ($envFile in $envFiles) {
    if (Test-Path $envFile) {
        $foundEnv = $true
        $content = Get-Content $envFile -Raw

        if ($content -match "SUPABASE_URL" -and $content -match "SUPABASE_ANON_KEY") {
            Write-Host "  ✅ 找到环境变量文件：$envFile" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  $envFile 缺少必要的 Supabase 配置" -ForegroundColor Yellow
            $warnings += "$envFile 配置不完整"
        }
    }
}

if (-not $foundEnv) {
    Write-Host "  ⚠️  本地未找到 .env 文件" -ForegroundColor Yellow
    Write-Host "     → 确保 Netlify 生产环境已配置环境变量" -ForegroundColor Gray
}
Write-Host ""

# ============================================
# Check 6: 检查数据库迁移脚本
# ============================================
Write-Host "[6/7] 检查数据库迁移脚本..." -ForegroundColor Cyan

$migrationFile = "supabase\migrations\002_refactor_sync.sql"
if (Test-Path $migrationFile) {
    $migrationContent = Get-Content $migrationFile -Raw
    $requiredTables = @("app_state_v2", "operations")
    $hasAllTables = $true

    foreach ($table in $requiredTables) {
        if ($migrationContent -notmatch $table) {
            $hasAllTables = $false
            break
        }
    }

    if ($hasAllTables) {
        Write-Host "  ✅ 数据库迁移脚本完整" -ForegroundColor Green
        Write-Host "     → 需要在 Supabase Dashboard 手动执行" -ForegroundColor Gray
    } else {
        Write-Host "  ❌ 迁移脚本内容不完整" -ForegroundColor Red
        $issues += "迁移脚本损坏"
    }
} else {
    Write-Host "  ❌ 迁移脚本不存在" -ForegroundColor Red
    $issues += "迁移脚本缺失"
}
Write-Host ""

# ============================================
# Check 7: 检查依赖包
# ============================================
Write-Host "[7/7] 检查依赖包..." -ForegroundColor Cyan

if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json

    if ($packageJson.dependencies."@supabase/supabase-js") {
        Write-Host "  ✅ Supabase JS 客户端已安装" -ForegroundColor Green
    } else {
        Write-Host "  ❌ 缺少 @supabase/supabase-js 依赖" -ForegroundColor Red
        $issues += "缺少 Supabase 依赖"
    }
} else {
    Write-Host "  ❌ package.json 不存在" -ForegroundColor Red
    $issues += "package.json 缺失"
}
Write-Host ""

# ============================================
# 诊断总结
# ============================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  📊 诊断结果" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✅ 没有发现问题！项目状态正常。" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎯 下一步：执行部署" -ForegroundColor Cyan
    Write-Host "   运行：.\deploy-new-architecture.ps1" -ForegroundColor Yellow
    Write-Host ""
} else {
    if ($issues.Count -gt 0) {
        Write-Host "❌ 发现 $($issues.Count) 个严重问题：" -ForegroundColor Red
        foreach ($issue in $issues) {
            Write-Host "   • $issue" -ForegroundColor Red
        }
        Write-Host ""
    }

    if ($warnings.Count -gt 0) {
        Write-Host "⚠️  发现 $($warnings.Count) 个警告：" -ForegroundColor Yellow
        foreach ($warning in $warnings) {
            Write-Host "   • $warning" -ForegroundColor Yellow
        }
        Write-Host ""
    }
}

# ============================================
# 409 错误根因分析
# ============================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🔍 409 错误根因分析" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "当前 409 错误来自：" -ForegroundColor Yellow
Write-Host ""
Write-Host "  🔧 旧架构（cloud-state.mjs）" -ForegroundColor Red
Write-Host "     • 使用乐观锁（updated_at 比对）" -ForegroundColor Gray
Write-Host "     • 14 个独立模块表" -ForegroundColor Gray
Write-Host "     • 多设备同时编辑时频繁冲突" -ForegroundColor Gray
Write-Host ""

Write-Host "解决方案：" -ForegroundColor Green
Write-Host ""
Write-Host "  1️⃣  执行数据库迁移（Supabase Dashboard）" -ForegroundColor Cyan
Write-Host "     → SQL Editor → 运行 002_refactor_sync.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "  2️⃣  启用 Realtime（Supabase Dashboard）" -ForegroundColor Cyan
Write-Host "     → Database → Replication → operations 表 → ✓ Enable" -ForegroundColor Gray
Write-Host ""
Write-Host "  3️⃣  部署新架构" -ForegroundColor Cyan
Write-Host "     → 运行：.\deploy-new-architecture.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  4️⃣  灰度测试" -ForegroundColor Cyan
Write-Host "     → 浏览器控制台：window.__enableRealtimeSync()" -ForegroundColor Gray
Write-Host "     → 刷新页面，验证不再有 409 错误" -ForegroundColor Gray
Write-Host ""

Write-Host "📚 详细文档：DEPLOY_NOW.md" -ForegroundColor Cyan
Write-Host ""
