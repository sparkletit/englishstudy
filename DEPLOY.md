# 云端部署手册（Cloudflare Workers + Supabase）

> 应用已改造为云端就绪：OpenNext 适配 + Hyperdrive 连 Supabase + R2 音频缓存 + 密钥环境变量。
> 本机模式（`npm run up`）完全不受影响。

## 你需要准备的账号

1. **Cloudflare 账号**（免费）：dash.cloudflare.com 注册
2. **Supabase 账号**（免费，可用 GitHub 登录）：supabase.com 注册
3. **一个域名**（已解析到 Cloudflare，见第 6 步）

## 一、创建 Supabase 项目

1. supabase.com → New project → 随意命名（如 `syl`），设一个数据库密码（记下来），区域选新加坡（Southeast Asia）
2. 等项目就绪后：**Project Settings → Database → Connection string → URI**
   选择 **Connection pooling** 标签（Transaction mode, 端口 6543），复制形如：
   ```
   postgresql://postgres.abcdefghij:你的密码@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
   （表不用手动建——应用首次访问会自动建 units/words 表）

## 二、登录 Cloudflare 并创建绑定资源

```bash
npx wrangler login        # 浏览器授权

# Hyperdrive（连 Supabase，粘贴上面的连接串）
npx wrangler hyperdrive create syl-pg --connection-string="postgresql://postgres.xxxx:密码@aws-0-xxx.pooler.supabase.com:6543/postgres"

# R2 音频缓存桶
npx wrangler r2 bucket create syl-cache

# 查 Hyperdrive id（下一步要填）
npx wrangler hyperdrive list
```

## 三、改 wrangler.jsonc

把末尾两行注释打开并填 id：

```jsonc
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "填上一步查到的id" }],
"r2_buckets": [{ "binding": "SYL_CACHE", "bucket_name": "syl-cache" }],
```

## 四、设置华为云密钥（secret，不进代码库）

```bash
npx wrangler secret put SIS_AK    # 粘贴 AK
npx wrangler secret put SIS_SK    # 粘贴 SK
npx wrangler secret put SIS_PID   # 粘贴项目ID（01a0ccca84c270fc9c66653ccecb71bc）
```

## 五、部署 🚀

```bash
npm run cf:deploy
```

完成后会得到 `https://syl-divider.<你的子域>.workers.dev`，先打开验证能用。

## 六、绑定你的域名

1. Cloudflare 控制台 → Add a site → 输入你的域名 → 选 **Free 计划**
2. 按提示到你买域名的服务商处，把 **Nameserver 改成 Cloudflare 给的两个**（等生效，约几分钟到几小时）
3. Cloudflare → Workers & Pages → syl-divider → **Settings → Domains & Routes → Add → Custom domain** → 填如 `syl.你的域名.com`
4. 等证书签发完成，即可用该域名访问

## 七、保活（重要，否则 Supabase 免费版 7 天不访问会暂停）

到 cron-job.org（免费）创建定时任务：每 3 天访问一次
`https://你的域名/api/units`
即可保持数据库不休眠。

## 日常更新

改完代码后重新 `npm run cf:deploy` 即可。

## 常见问题

- **听写/拼写提示数据库未启动**：Hyperdrive 配置或 Supabase 连接串有误；`npx wrangler tail` 看实时日志
- **生词发音第一次慢**：云端无 403 个预置之外的缓存，首次实时合成（约 1-2 秒）后进 R2，之后秒播
- **费用**：CF Workers 免费 10 万请求/天、R2 免费 10GB；Supabase 免费 500MB（可存数十万单词）；SIS 按次计费照旧
