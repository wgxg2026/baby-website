# 情侣时光网站上下文摘要

更新时间：2026-09-28
项目目录：`C:/Users/qunhuiwu/Desktop/和宝宝的小网站`

## 当前目标

维护并继续部署一个无登录、两个人共同编辑的私人情侣记录网站。网站使用 Netlify 托管，Supabase 保存共享数据和照片。当前重点是保证留言回复、评论、照片上传和各模块在手机与电脑端稳定同步，并让新 Netlify 站点可公开访问、可持续部署。

## 已完成工作

- 前端已从浏览器直连 Supabase 改为同域 Netlify Functions 代理。
- 已添加三个 Functions：`netlify/functions/cloud-state.mjs`、`netlify/functions/moment-upload.mjs`、`netlify/functions/moment-image.mjs`。
- 已配置 `netlify.toml`：构建命令 `pnpm build`，发布目录 `dist`，Functions 目录 `netlify/functions`，并配置 `/api/*` 重写。
- 云端同步继续使用现有 `public.shared_app_state` 表，按模块行保存；保留冲突检测、重试、离线操作队列和 5 秒轮询。
- 待保存操作支持压缩：连续编辑只保留最后一次，本地新增后删除可以抵消，回复新增后删除可以抵消。
- 照片墙使用 IndexedDB 草稿库：数据库 `couple-time-capsule-v1`，Store 为 `moment-drafts`。
- 照片上传失败、刷新、关闭页面或离开照片墙后仍可自动重试。
- 多张照片上传支持断点恢复：已成功上传的图片路径会写回草稿，后续失败重试不会重复上传已成功图片。
- 留言回复和评论改为全宽多行 `textarea`，支持 `Ctrl/Cmd + Enter` 发送。
- 手机端导航改成两列；主要页面已处理横向溢出和长文本换行。
- 支持 JPG、PNG、WebP、GIF，以及通过 `heic2any` 处理 HEIC/HEIF。
- 历史 Supabase Storage 图片地址会转换为同域图片代理地址。
- 已移除不再使用的 `@supabase/supabase-js` 依赖。
- README 已恢复为正常中文；.gitignore 已排除 `.env`、`dist`、ZIP、Netlify 缓存和测试产物。
- 已初始化 Git 并完成本地提交：`ab7e4a1 stabilize cloud sync and photo drafts`。

## 关键决定

- 保持无登录共享空间，知道网址即可共同编辑。
- 继续使用现有 Supabase 项目、`shared_app_state` 表和 `moments` Storage bucket，不新建数据库表。
- Realtime 不作为可靠性前提；REST 代理、轮询和本地持久队列负责最终保存。
- Supabase 密钥只配置在 Netlify 服务端环境变量，不提交 GitHub，不写入前端构建产物。
- 不删除旧 Netlify 站点；新站验收后再决定是否切换或保留旧站。
- GitHub 仓库应为私有仓库，Netlify 最终连接 GitHub 自动部署。

## 主要涉及文件

- 前端入口与页面：`src/App.tsx`
- 样式与响应式布局：`src/styles.css`
- 云端同步和操作队列：`src/lib/sharedCloud.ts`
- 照片上传代理客户端：`src/lib/supabase.ts`
- IndexedDB 照片草稿：`src/lib/momentDrafts.ts`
- 本地数据和迁移：`src/lib/localStore.ts`
- 类型定义：`src/types.ts`
- Netlify 配置：`netlify.toml`
- 云端代理：`netlify/functions/cloud-state.mjs`
- 照片上传：`netlify/functions/moment-upload.mjs`
- 照片读取：`netlify/functions/moment-image.mjs`
- 单元测试：`src/lib/__tests__/sharedCloud.test.ts`、`src/lib/__tests__/momentDrafts.test.ts`、`netlify/functions/__tests__/proxy.test.ts`
- E2E 测试：`e2e/site.spec.ts`
- 部署说明：`README.md`
- 项目历史交接资料：`PROJECT_HANDOFF.md`

## 验证结果

以下命令已通过：

- `pnpm lint`
- `pnpm test`：3 个测试文件，13 个测试全部通过
- `pnpm test:e2e`：12 个 Playwright 用例全部通过
- `pnpm build`

E2E 覆盖视口：`1440×900`、`1024×768`、`390×844`、`375×812`。已验证留言输入尺寸、快捷发送、主要页面无横向滚动、照片失败后刷新恢复和照片失败后重试。

本地 `pnpm dev:netlify` 能启动首页和三个 Function。此前本机直连 Supabase 的 API 测试出现 502，原因是本机网络/TLS 连接 Supabase 失败；Function 路由和错误处理已有测试覆盖。

## 当前部署状态

- Netlify CLI 已登录账号：`son jiawenb`，团队：`da`。
- 新 Netlify 项目：`couple-time-capsule-2026`。
- 新站点地址：`https://couple-time-capsule-2026.netlify.app`。
- 项目管理地址：`https://app.netlify.com/projects/couple-time-capsule-2026`。
- 新站点已配置生产环境变量 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`，值未写入本文件。
- 已完成一次生产部署，构建和 Functions 打包成功。
- 线上首页在 2026-09-28 从当前环境检查返回 HTTP 200。
- GitHub CLI 未安装；本地仓库尚未添加 GitHub remote，也尚未推送到 GitHub。

## 未完成事项

1. 在 GitHub 创建私有仓库 `couple-time-capsule`，或使用已有私有仓库。
2. 将本地仓库分支改为 `main`（如需要），添加 GitHub remote 并推送提交 `ab7e4a1`。
3. 在 Netlify 项目中连接该 GitHub 仓库，确认构建命令、发布目录和 Functions 目录沿用 `netlify.toml`。
4. 用手机和电脑分别访问新生产地址，验证留言回复、照片上传、刷新恢复和删除操作。
5. 确认 Netlify 的 Visitor access / Project visibility 已设置为 Public；如果仍返回 401，需要在项目设置中关闭访问保护。
6. 如需持续部署，在 GitHub 推送一次后确认 Netlify 自动产生新部署。

## 已知问题与风险

- 当前本地环境没有 GitHub CLI；不影响使用 GitHub 网页创建仓库，但推送时可能需要浏览器完成 Git 凭据授权。
- Netlify 站点曾返回过 401，原因是站点访问保护或私有可见性；当前应以浏览器实际打开结果为准，必须确认 Public。
- 本机直连 Supabase 可能发生 TLS reset/网络失败；线上代理由 Netlify 请求 Supabase，不能用本机失败直接判断线上 Function 失败。
- 构建存在大 chunk 警告，暂不影响功能；后续可通过动态导入进一步拆包。
- 无登录共享空间的隐私边界是“知道网址即可编辑”，不适合存放高敏感隐私或公开分享网址。
- 照片通过 Netlify Function 和 Supabase Storage 处理，需持续关注 Netlify Function 使用量、Storage 权限和照片大小限制。

## 下一步操作

### GitHub

1. 在 GitHub 网页创建私有仓库：`couple-time-capsule`。
2. 在项目目录执行：

```powershell
git branch -M main
git remote add origin https://github.com/<用户名>/couple-time-capsule.git
git push -u origin main
```

如果 remote 已存在，先用 `git remote -v` 检查，不要重复添加。

### Netlify

1. 打开 Netlify 项目管理地址。
2. 将 Project visibility / Visitor access 设置为 Public。
3. 在 Build settings 确认：Build command 为 `pnpm build`，Publish directory 为 `dist`，Functions directory 为 `netlify/functions`。
4. 连接 GitHub 私有仓库并触发一次部署。
5. 在生产地址验证 `/`、`/#/messages`、`/#/moments` 和 `/#/food`。

### 修改代码后的本地检查

```powershell
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

不要把 `.env`、Supabase key、`dist`、ZIP 或测试报告提交到 GitHub。
