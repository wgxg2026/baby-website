# 和宝宝的时光

一个给哈基辉和麦小雯共同记录生活的私人情侣网站。网站不设登录，知道地址的人可以共同编辑；数据保存在 Supabase，网页由 Netlify 自动构建和托管。

## 主要功能

- 一百件事、纪念日、生理期、留言与回复
- 中国旅行地图、歌单、影音和餐厅记录
- 短期目标、长期目标与成就墙
- 照片墙、评论和多张照片上传
- 离线操作队列、5 秒轮询同步和冲突重试
- IndexedDB 照片草稿，上传失败或刷新后可继续重试

## 本地运行

```bash
pnpm install
pnpm dev
```

需要联调 Netlify Functions 时使用：

```bash
pnpm dev:netlify
```

## 环境变量

复制 .env.example 为 .env，只在本机填写：

```env
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_ANON_KEY=你的 publishable 或 anon key
```

不要使用 VITE_ 前缀。浏览器不再直接连接 Supabase，密钥只由 Netlify Function 读取。.env 已被 Git 忽略，不会提交到 GitHub。Netlify 站点也要配置同名的两个环境变量。

## Netlify 自动部署

- Build command：`pnpm build`
- Publish directory：`dist`
- Functions directory：`netlify/functions`

这些值已经写入 netlify.toml。将私有 GitHub 仓库连接到 Netlify 后，每次推送会自动构建。Supabase 继续使用现有的 public.shared_app_state 表和 moments Storage bucket，迁移 Netlify 站点不需要迁移数据库。

## 检查命令

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```
