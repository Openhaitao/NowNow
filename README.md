# NowNow 🐰

一张全组共享的"自由纸"：每人一页 Apple Notes 式的目标/备忘页 + 最小协作层（@人派事、看见彼此、两步确认完成）。先是笔记，才是系统。

## 产品规则（全部规则就这些）

- **一切都是条目**：一行自由文本。带完成框 = 目标，不带 = 备忘。
- **每人一页四个区**：今日 / 本周 / 本月 + 「@我的」收件箱。
- **@人**：条目里写 `@handle`，对方收件箱收到；认领 = 复制进自己的区。
- **两条完成流**：
  - 自己的目标 → 勾选完成，沉底变灰；
  - @别人的 → 对方勾选 = 已解决（黄色高亮回到你这）→ **只有你能点关闭**。
- **可见性**：默认全员可见，条目可单独设私密（👁/🔒）。

## 技术

Vite + React SPA，数据全走 supabase-js 直连（无自建后端）。权限规则焊在数据库 RLS 层（`supabase/schema.sql`），前端只是显示。

## 部署步骤

1. **建库**：Supabase 控制台 → SQL Editor → 粘贴 `supabase/schema.sql` 全文 → Run（幂等，可重复跑）。
2. **关注册**：Authentication → Sign In / Up 关掉 "Allow new users to sign up"，再手动 Add user 添加允许的邮箱（白名单就是这么实现的）。
3. **前端配置**：`cp .env.example .env.local`，填入 Settings → API 里的 Project URL 和 anon key。
4. **本地跑**：`npm install && npm run dev`。
5. **上线**：Cloudflare Pages 连接此仓库，build 命令 `npm run build`、输出目录 `dist`，环境变量设同样两个值；再把 Pages 域名加进 Supabase Authentication → URL Configuration 的 Redirect URLs。

## 环境隔离

现在有真实用户后，线上和测试必须隔离：

- **production**：`now-now.pages.dev`，Cloudflare Pages 项目 `now-now`，只连生产 Supabase。
- **staging**：建议 Cloudflare Pages 项目 `now-now-staging`，只连独立 Supabase staging 项目。
- staging 不允许连接生产 Supabase。`scripts/deploy-staging.sh` 会检查 `.env.staging`，发现生产 URL 会直接拒绝部署。
- Pages Worker 的 `/sb/*` 代理也按环境切 Supabase origin；非生产链接缺配置时 fail-closed，不会偷偷回落到生产库。

### 初始化 staging

1. Supabase 新建独立项目，例如 `nownow-staging`。
2. 在 staging Supabase SQL Editor 依次跑 `supabase/schema.sql` 和当前需要的 migration。
3. 在 staging Supabase 里建 `doc-images` storage bucket、Auth 测试账号、测试邀请码。
4. 把 `now-now-staging.pages.dev` 加到 staging Supabase Authentication → URL Configuration 的 Site URL / Redirect URLs。
5. 本地复制并填写：

```bash
cp .env.staging.example .env.staging
```

6. 如果 Cloudflare Pages staging 项目还不存在，先建：

```bash
npx wrangler pages project create now-now-staging --production-branch main
```

7. 部署 staging：

```bash
npm run deploy:staging
```

生产仍走：

```bash
npm run deploy:production
```

## 开发

```bash
npm install
npm run dev    # 本地开发
npm run build  # 产物在 dist/
```
