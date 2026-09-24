# 云端部署手册（Cloudflare Workers + Supabase）——已部署完成

> 当前线上地址：**https://e.elpf.tech**（Cloudflare 自定义域名）
> 备用地址：https://syl-divider.jaredxiao.workers.dev
>
> 架构：Next.js（OpenNext 适配）→ Cloudflare Workers；数据库 → Supabase REST（PostgREST）；
> 音频缓存 → R2 桶 syl-cache；发音合成 → 华为云 SIS（密钥为 Worker secrets）。
> 本机模式（`npm run up`，podman PostgreSQL）完全独立，互不影响。

## 已完成的配置（备查）

- Worker：`syl-divider`（wrangler.jsonc 含 SUPABASE_URL var + R2 绑定）
- Secrets（`wrangler secret list` 可查）：`SIS_AK` / `SIS_SK` / `SIS_PID` / `SUPABASE_SERVICE_KEY`
- Supabase 表 `units`/`words` 已建，RLS 已关闭，service_role 已授权
- 自定义域名 e.elpf.tech 已绑定（DNS 托管在同账号 Cloudflare）

## 日常更新部署

```bash
cd F:/projects/es-deploy          # 部署副本（也可以重新 git clone）
git pull                          # 先推 GitHub，再在这里拉取
set CLOUDFLARE_API_TOKEN=<你的CF令牌>
npm run cf:deploy
```

> 注意：wrangler.jsonc 在仓库里绑定是注释态（本地 next build 需要），部署副本中是启用态。
> 若重新 clone，需按仓库内注释启用 r2_buckets 与 vars 再部署。

## 保活（重要）

Supabase 免费版 **7 天无访问会暂停项目**。到 https://cron-job.org（免费）建定时任务：
每 3 天 GET `https://e.elpf.tech/api/units` 即可。

## 常见问题

- **听写/拼写报数据库错误**：检查 Supabase 项目是否被暂停（去 dashboard 恢复）；`wrangler secret list` 确认 SUPABASE_SERVICE_KEY 存在
- **生词发音第一次慢 1-2 秒**：实时合成后进 R2，之后秒播
- **看 Worker 实时日志**：`npx wrangler tail syl-divider`
- **费用**：Workers 免费 10 万请求/天；R2 免费 10GB；Supabase 免费 500MB；SIS 按次计费

## 安全提醒

CF API Token、Supabase secret、数据库密码、华为云 AK/SK 若曾在聊天/明文中出现，
建议定期到各控制台轮换：CF（Profile → API Tokens → Roll）、Supabase（Settings → API）、
华为云（控制台 → 我的凭证 → 访问密钥）。轮换后需同步更新：
`wrangler secret put <名称>`（CF）、sis-config.json（本机）。
