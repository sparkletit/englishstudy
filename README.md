# 英语音节划分器 · 音节点读（Next.js）

输入单词 → 元音标红展示 → 点击划分音节 → 点音节卡/单个音标听标准发音（华为云 SIS 合成，音色 Alvin，音量 80）。

## 运行

```bash
npm install        # 首次
npm run dev        # 开发模式，http://127.0.0.1:8123
npm run build && npm start   # 生产模式，同端口；手机用 http://电脑局域网IP:8123
```

## 结构

| 路径 | 作用 |
|---|---|
| `app/page.jsx` | 主界面（输入、划分展示、音节/音标点读、设置弹窗） |
| `app/api/tts/route.js` | SIS 实时合成代理：库里没有的音节自动合成并缓存到 `public/syllables/` |
| `lib/engine.js` | 音节划分 + DJ 音标生成引擎（纯函数，从原 index.html 迁移） |
| `lib/sis.js` | 华为云 SDK-HMAC-SHA256 签名与 SIS 合成（Node 端） |
| `public/syllables/` | 音节/音素音频库（352 音节 + 44 音素，PH_*.mp3 为单音素） |
| `sis-config.json` | 华为云密钥（服务端读取，**不会**下发到浏览器，请勿提交到 git） |
| `tools/gen-syllables.mjs` | 批量生成音频：`npm run gen -- --words 词表.txt`（详见脚本顶部注释） |
| `tools/test-engine.mjs` | 引擎回归测试：`node tools/test-engine.mjs [单词...]` |

## 发音来源

- **音节卡 / 单个音标**：优先播 `public/syllables/` 本地文件；缺失时经 `/api/tts` 实时调华为云 SIS 合成（音色 Alvin、音量 80，见 `sis-config.json`），响应自动落盘，之后秒播。
- **整词朗读**：有道词典在线发音，失败回退系统 TTS。
- 可选 ElevenLabs / Azure 引擎（⚙ 语音设置，浏览器直连）。

## 补充新词

把新词写进 txt（空格或换行分隔），运行：

```bash
npm run gen -- --words 新词.txt
```

已存在的音节自动跳过，只生成缺的。

## 遗留文件

`index.html`、`server.js`、`assets/` 为改造前的单文件版本，已被 Next.js 版本取代，仅作参考，可删除。
