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

## 开发

```bash
npm install
npm run dev    # 本地开发
npm run build  # 产物在 dist/
```
