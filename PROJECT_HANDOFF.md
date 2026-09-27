# 和宝宝的时光：项目交接精华文档

## 1. 项目定位

这是一个只给两个人使用的私人情侣时光网站，主要用于记录共同生活、旅行、照片和小目标。

当前默认称呼：

- 哈基辉：底层数据值 `me`
- 麦小雯：底层数据值 `baby`

项目不包含登录功能，访问者只要拿到网站地址即可进入。数据权限目前依赖 Supabase 匿名读写策略，因此不要把网址公开到不相关的地方。

## 2. 技术栈

- 前端：React 18 + TypeScript
- 构建：Vite
- 路由：React Router 的 `HashRouter`
- 图标：lucide-react
- 日期：date-fns
- 地图：ECharts + 本地中国地图数据 `src/data/china.json`
- 云端：Supabase JS
- 部署：Netlify Drop 静态部署

常用命令：

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm preview
```

本地开发地址通常是：

```text
http://localhost:5173/
```

`localhost` 只在开发电脑上有效；电脑关机后，localhost 服务会停止。Netlify 网站和 Supabase 数据不会因为电脑关机而停止。

## 3. 功能模块

主要页面路由：

| 路由 | 功能 |
| --- | --- |
| `/` | 首页概览、在一起天数、最近记录 |
| `/bucket-list` | 一百件事，支持新增、完成勾选、删除 |
| `/timeline` | 在一起时间和纪念日 |
| `/period` | 生理期记录 |
| `/messages` | 留言板和情绪表达 |
| `/map` | 旅行城市记录，按省份点亮中国地图 |
| `/music` | 歌曲分享 |
| `/watchlist` | 电影、剧集、综艺、歌曲清单 |
| `/food` | 好吃的店面记录 |
| `/savings` | 长期目标、短期目标、截止日期、完成状态和评论 |
| `/moments` | 多图照片墙，照片加文字、地点、发布人、评论和放大预览 |
| `/achievements` | 在一起后变得更好的成就墙 |
| `/settings` | 手动位置和 Supabase 状态 |

## 4. 数据结构与保存位置

### 本地缓存

浏览器 localStorage 使用的 key：

```text
couple-time-capsule-data
```

本地缓存用于离线或云端连接失败时保留当前浏览器记录。它只属于当前浏览器，不会自动同步到其他设备。

### Supabase 云端共享数据

当前项目使用一个共享表和一行 JSON 文档：

```text
表：public.shared_app_state
行 id：default
主要字段：data jsonb
```

`data` 中包含完整的 `AppData`，包括：

```text
startDate
bucketItems
periodRecords
messages
locations
travelCheckins
musicItems
mediaItems
foodPlaces
savingGoals
achievements
moments
comments
anniversaries
```

新上传照片会保存到 Supabase Storage 的 `moments` bucket，再把公开 URL 放进 `moments.images`。旧数据仍兼容 `moments.imageUrl` 和 Base64 图片。未配置 Supabase 时，新图片会使用浏览器本地 Base64 作为离线兜底。

留言回复保存在 `messages[].replies`，照片、留言和目标评论统一保存在 `comments` 数组中，当前只支持一层评论/回复。

## 5. 云端同步逻辑

核心文件：

- `src/lib/supabase.ts`：从 Vite 环境变量创建 Supabase 客户端
- `src/lib/sharedCloud.ts`：读取、保存和监听共享数据
- `src/lib/localStore.ts`：本地缓存、数据规范化、生成 ID
- `src/App.tsx`：初始化、自动保存、Realtime 更新

同步流程：

1. 页面先读取 localStorage，避免白屏。
2. 如果存在 Supabase 配置，进入连接状态。
3. 先读取云端 `shared_app_state/default`。
4. 云端数据和本地数据按记录 `id` 合并。
5. 合并后的数据写回云端，避免本地新记录丢失。
6. 初始化完成后，数据变化会延迟约 450ms 自动 upsert。
7. Supabase Realtime 收到其他设备更新后，直接更新页面。
8. 每次数据变化也会保存到当前浏览器 localStorage。

重要约束：

- 不要在云端初始化完成前把本地初始数据写回云端。
- 不要随意更改记录的 `id`，否则同步会被当成新记录。
- 当前是“整份 JSON 文档覆盖式保存”，不是逐表逐行保存。
- 两台设备同时修改时，后保存的数据可能覆盖同一字段；新增不同记录通常可以通过 ID 合并保留。

## 6. Supabase 配置

本地 `.env` 需要包含：

```env
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的publishable或anon key
```

当前项目使用的 Supabase 项目地址曾配置为：

```text
https://hmltzrntbrcegdizbmkw.supabase.co
```

不要把 anon key、service_role key或其他密钥写入公开文档、Git仓库或聊天截图。项目根目录的 `.env` 已被 `.gitignore` 忽略。

首次建立或重建 Supabase 表时，在 SQL Editor 执行：

```text
supabase/shared_state.sql
```

该 SQL 会：

- 创建 `public.shared_app_state`
- 开启 RLS
- 允许匿名读取
- 允许匿名写入
- 将表加入 `supabase_realtime`

如果最后一条 publication SQL提示表已存在于 publication，可以保留现有配置，不要重复添加。

## 7. Netlify 部署

生产构建输出目录是：

```text
dist/
  index.html
  index.js
  index.css
  chunk-*.js
```

当前 `vite.config.ts` 特意把 JS、CSS和动态 chunk 放在网站根目录，原因是此前 Netlify Drop 部署中 `/assets/*` 出现过 404。ECharts 地图和中国地图数据已改为进入旅行地图页时再按需加载，所以 `dist` 中会出现 `chunk-*.js`，部署时必须和三件套一起上传。

推荐部署包：

```text
netlify-root-assets-fixed.zip
```

ZIP 第一层必须直接是：

```text
index.html
index.js
index.css
chunk-*.js
```

不要上传：

- 整个项目目录
- `node_modules`
- `src`
- `.env`
- `netlify.toml`
- 外层 `dist`目录

如果使用 Netlify Drop：

1. 打开新 Netlify 站点的 Deploys。
2. 选择手动部署区域。
3. 上传 `netlify-root-assets-fixed.zip`，或上传解压后的 `dist` 内容。
4. 在 Deploy file browser确认 `index.html`、`index.js`、`index.css` 和 `chunk-*.js` 都位于根目录。
5. 打开站点网址并使用 `Ctrl + F5`。

部署后检查：

```text
https://你的站点.netlify.app/
https://你的站点.netlify.app/index.js
https://你的站点.netlify.app/index.css
```

首页、JS、CSS都应返回 `200`。`favicon.ico 404`通常不影响网页运行。

如果使用 Git 自动部署：

```text
Build command: pnpm build
Publish directory: dist
```

并在 Netlify Environment variables中配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，然后重新构建。

## 8. Netlify账号迁移原则

只换 Netlify 账号，不需要迁移数据库。

新旧 Netlify 站点只要使用同一个：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

就会读取同一条 Supabase共享数据。旧站点不需要先暂停，建议等新站点验证成功后再决定是否删除旧站点。

只有更换 Supabase 项目时，才需要：

1. 在新 Supabase项目执行 `supabase/shared_state.sql`；
2. 迁移 `shared_app_state/default` 数据；
3. 重新配置 URL和 anon key；
4. 重新构建并部署；
5. 如使用 Storage，再单独迁移照片文件。

## 9. 常见故障排查

### 白屏且 JS/CSS 404

先看浏览器控制台：

```text
/index.js 404
/index.css 404
```

或：

```text
/assets/index.js 404
/assets/index.css 404
```

处理顺序：

1. 打开 Netlify Deploy file browser。
2. 确认 `index.html`引用的文件名和实际文件名完全一致。
3. 确认文件位于根目录，不在额外的 `dist`或项目目录中。
4. 重新上传最新 ZIP。
5. `Ctrl + F5`或使用无痕窗口。

### 线上返回 401

通常是 Netlify开启了访问保护。检查：

```text
Project configuration → Access and security → Visitor access
```

关闭 Password protection、Team-only access或 Require login等限制。

### 页面能打开但显示本地记录模式

检查部署方式：

- Netlify Drop：环境变量已在构建时写进 `dist/index.js`，必须重新构建后再上传；
- Git部署：检查 Netlify Environment variables；
- 不要只修改本地 `.env`后直接复用旧 ZIP。

### 刷新后数据消失

检查：

1. Supabase表是否为 `public.shared_app_state`；
2. 是否存在 `id=default`的行；
3. RLS是否允许 `anon` select和写入；
4. 浏览器网络面板中 Supabase REST 请求是否返回 200；
5. 页面侧边栏是否显示具体云端错误。

### Realtime不更新

检查：

1. `shared_app_state`是否加入 `supabase_realtime` publication；
2. Supabase项目Realtime是否可用；
3. 页面是否显示“云端实时同步中”；
4. 即使Realtime失败，刷新读取和延迟保存仍应工作。

### 浏览器扩展报错

以下错误通常与项目无关：

```text
chrome-extension://.../manifest.json
chrome-extension://invalid/
```

优先关注同一时间出现的项目资源 404、Supabase请求错误和 JavaScript运行时错误。

## 10. 下一次接手项目的检查顺序

1. 检查 `package.json`、`vite.config.ts`和`dist`结构。
2. 检查 `.env`是否存在，但不要把密钥输出到日志。
3. 运行：

```bash
pnpm build
pnpm lint
```

照片墙新增功能需要在 Supabase SQL Editor 执行完整的 `supabase/shared_state.sql`，以创建 `moments` Storage bucket 及匿名读写策略。

4. 检查 `dist/index.html`引用的 JS/CSS文件是否真实存在。
5. 检查 Supabase `shared_app_state/default`是否能匿名读取。
6. 启动 `pnpm dev`并测试：
   - 新增一百件事；
   - 勾选一百件事；
   - 发布照片墙；
   - 刷新页面；
   - 用第二个浏览器确认共享数据。
7. 需要部署时，只上传最新 `dist`内容或重新生成部署 ZIP。

## 11. 当前已知技术债

- 部分旧源码和旧 README曾出现中文编码乱码，后续修改文案时统一保存为 UTF-8。
- 当前所有数据放在一行 JSON中，数据量变大后应拆成 Supabase多表。
- 新上传照片使用 Supabase Storage 的 `moments` bucket，旧照片仍兼容 Base64 或原有 URL。
- 当前无登录和成员权限控制，拿到网址的人理论上可以编辑共享数据。
- 当前同时编辑采用简单覆盖策略，未实现细粒度冲突解决。
- 当前地图按城市归属省份点亮，不是精确市级地图。
