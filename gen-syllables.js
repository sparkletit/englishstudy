#!/usr/bin/env node
/**
 * gen-syllables.js —— 华为云批量生成音节发音库（在电脑上运行，浏览器不受 CORS 限制）
 *
 * 作用：读取词表 → 用 index.html 里的音节引擎拆分音节 → 把每个音节的 IPA 转成 ARPAbet
 *      → 调用华为云「语音交互服务 SIS」一句话合成 → 保存到 assets/syllables/ 目录。
 * 之后 App 在 ⚙语音设置 选「本地音节库」，点音节直接播本地文件（离线、零延迟、不限额）。
 *
 * 准备（约 5 分钟）：
 *   1. huaweicloud.com 注册并完成支付宝个人实名认证（无需信用卡）
 *   2. 控制台搜索「语音交互服务 SIS」→ 开通服务（区域选 华北-北京四）
 *   3. 控制台 →「我的凭证」→「访问密钥」→ 新建访问密钥，下载或复制 AK / SK
 *   4. 「我的凭证」→「项目列表」→ 复制华北-北京四的「项目ID」
 *
 * 用法：
 *   node gen-syllables.js --ak AK --sk SK --pid 项目ID [--region cn-east-3]
 *        [--voice english_alvin_common] [--words 词表.txt] [--out assets/syllables]
 *
 *   词表格式：每行一个英文单词（# 开头为注释）。不给 --words 时使用内置的常用校园词表。
 *   已存在的同名文件会跳过，可反复运行增量补充。
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- 参数 ---------- */
const args = {};
process.argv.slice(2).forEach((a, i, arr) => { if(a.startsWith('--')) args[a.slice(2)] = arr[i + 1]; });
const AK = args.ak, SK = args.sk, PID = args.pid;
const DRY = process.argv.includes('--dry');   /* --dry: 只列出词表的音节清单，不调用接口 */
const PHONEMES_MODE = process.argv.includes('--phonemes');  /* --phonemes: 生成 48 个单音素文件 PH_*.mp3 */
const REGION = args.region || 'cn-north-4';
const VOICE = args.voice || 'english_alvin_common';
const OUT = args.out || path.join(__dirname, 'assets', 'syllables');
const WORDS_FILE = args.words;

if(!AK || !SK || !PID){
  if(!DRY){
    console.error('缺少参数。用法: node gen-syllables.js --ak AK --sk SK --pid 项目ID [--region cn-north-4] [--voice 音色] [--words 词表.txt] [--dry]');
    process.exit(1);
  }
}

/* ---------- 内置词表（可被 --words 覆盖） ---------- */
const DEFAULT_WORDS = `apple banana orange pear grape
student teacher doctor nurse driver farmer worker singer
mother father brother sister grandmother grandfather family parent
cat dog duck pig cow horse sheep rabbit mouse panda monkey tiger lion elephant zebra giraffe kangaroo
one two three four five six seven eight nine ten eleven twelve
red yellow blue green black white orange purple pink brown
spring summer autumn winter sunny rainy windy cloudy snowy
january february march april may june july august september october november december
monday tuesday wednesday thursday friday saturday sunday
read write sing dance play jump run walk swim
breakfast lunch supper dinner
classroom playground schoolbag notebook pencil ruler eraser desk chair window door floor blackboard
water milk juice bread rice noodles chicken fish vegetable chocolate favourite beautiful
happy sad angry tired hungry thirsty
station library hospital museum cinema zoo park
today tomorrow yesterday morning afternoon evening night
student open paper tiger music robot seven
letter winter sister master rabbit happy sunny dollar chicken kitchen monkey monster secret
table apple little candle simple maple cycle eagle struggle jungle middle
computer elephant animal alphabet important understand education picture careful famous dangerous
reading making going running wanted played boiled walked needed danced boxes watches goes makes faces changes
because water want wash watch what warm word work world
could would should you young touch enough tough rough laugh eight height weight
friend people every seven never ever river second very many any
about above away ago alive asleep hotel only police zebra
quiet science idea real create telephone television museum saturday
student beautiful station question sure usually super human duty
giraffe penguin listening interesting vegetable afternoon study hundred classroom blackboard piano visit comfortable
carry hurry marry worry sorry stories cities babies cried carried visited stopped tried cried
bigger hottest fastest slowly quickly carefully happily easily teacher doctors
themselves suddenly everything difficult important gorilla`;

/* ---------- 从 index.html 提取音节引擎 ---------- */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if(!m){ console.error('未在 index.html 中找到引擎代码'); process.exit(1); }
const ENGINE = new Function(m[1].replace("'use strict';", '') + '\nreturn {analyze, PHONEMES};')();
const analyze = ENGINE.analyze;

/* ---------- IPA → ARPAbet（与 index.html 保持一致） ---------- */
const VOWEL_SET = new Set(['eɪ','aɪ','ɔɪ','əʊ','aʊ','ɪə','eə','ʊə','iː','uː','ɑː','ɔː','ɜː','æ','ɒ','ʌ','ə','ʊ','ɪ','e']);
const ARPA = {'b':'B','d':'D','f':'F','g':'G','h':'HH','j':'Y','k':'K','l':'L','m':'M','n':'N','p':'P','r':'R','s':'S','t':'T','v':'V','w':'W','z':'Z',
  'θ':'TH','ð':'DH','ʃ':'SH','ʒ':'ZH','tʃ':'CH','dʒ':'JH','ŋ':'NG',
  'æ':'AE','ɒ':'AA','ʌ':'AH','ə':'AH','ɜː':'ER','ɪ':'IH','e':'EH','ɑː':'AA','ɔː':'AO','ʊ':'UH','uː':'UW','iː':'IY',
  'eɪ':'EY','aɪ':'AY','ɔɪ':'OY','əʊ':'OW','aʊ':'AW'};
const ARPA_SPLIT = {'ɪə':['IH','R'], 'eə':['EH','R'], 'ʊə':['UH','R']};
function toArpabet(phs){
  const out = [];
  for(const p of phs){
    if(ARPA_SPLIT[p]) out.push(ARPA_SPLIT[p][0] + '1', ARPA_SPLIT[p][1]);
    else if(ARPA[p] !== undefined) out.push(VOWEL_SET.has(p) ? ARPA[p] + (p === 'ə' ? '0' : '1') : ARPA[p]);
  }
  return out.join(' ');
}

/* ---------- 华为云签名（与官方 SDK 输出逐字节一致，已验证） ---------- */
const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;
const TE = new TextEncoder();
async function sha256Hex(s){
  const d = await subtle.digest('SHA-256', TE.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(key, msg){
  const k = await subtle.importKey('raw', TE.encode(key), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const sig = await subtle.sign('HMAC', k, TE.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hwsSign(ak, sk, method, u, bodyStr, when){
  const p2 = n => String(n).padStart(2, '0');
  const now = when || new Date();
  const date = '' + now.getUTCFullYear() + p2(now.getUTCMonth() + 1) + p2(now.getUTCDate()) +
    'T' + p2(now.getUTCHours()) + p2(now.getUTCMinutes()) + p2(now.getUTCSeconds()) + 'Z';
  const hdrs = { 'content-type': 'application/json', 'host': u.host, 'x-sdk-date': date };
  const signed = Object.keys(hdrs).sort().join(';');
  const canonicalHeaders = Object.keys(hdrs).sort().map(k => k + ':' + hdrs[k] + '\n').join('');
  const uri = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';
  const canonical = [method, uri, '', canonicalHeaders, signed, await sha256Hex(bodyStr)].join('\n');
  const sts = 'SDK-HMAC-SHA256\n' + date + '\n' + await sha256Hex(canonical);
  const sig = await hmacHex(sk, sts);
  return { 'X-Sdk-Date': date, 'Authorization': 'SDK-HMAC-SHA256 Access=' + ak + ', SignedHeaders=' + signed + ', Signature=' + sig };
}

/* ---------- 调用华为云 TTS ---------- */
async function huaweiTtsOnce(ssml){
  const body = JSON.stringify({ text: ssml, config: { audio_format: 'mp3', sample_rate: '16000', property: VOICE, speed: 0, pitch: 0, volume: 80 } });
  const urlStr = 'https://sis-ext.' + REGION + '.myhuaweicloud.com/v1/' + PID + '/tts';
  const u = new URL(urlStr);
  const headers = await hwsSign(AK, SK, 'POST', u, body);
  const r = await fetch(urlStr, { method: 'POST', headers: Object.assign({'Content-Type': 'application/json'}, headers), body });
  const text = await r.text();
  if(!r.ok){ let code = ''; try{ code = JSON.parse(text).error_code || ''; }catch(e){} const err = new Error(r.status + ' ' + text.slice(0, 120)); err.code = code; throw err; }
  const j = JSON.parse(text);
  if(!j.result || !j.result.data) { const e = new Error(j.error_msg || '无音频数据'); e.code = j.error_code; throw e; }
  return Buffer.from(j.result.data, 'base64');
}
async function huaweiTts(arpa, sylText){
  try{
    return await huaweiTtsOnce('<speak><phoneme ph="' + arpa + '">' + (sylText || 'bee') + '</phoneme></speak>');
  }catch(e){
    /* 个别拼写（如 feb 被当作缩写）触发 SIS.0419，换成中性内文重试；发音由 ph 属性决定不受影响 */
    if(e.code === 'SIS.0419')
      return await huaweiTtsOnce('<speak><phoneme ph="' + arpa + '">syl</phoneme></speak>');
    throw e;
  }
}

/* ---------- 主流程 ---------- */
async function main(){
  const words = [...new Set(
    (WORDS_FILE ? fs.readFileSync(WORDS_FILE, 'utf8') : DEFAULT_WORDS)
      .split(/[\r\n#]+/).join(' ').split(/\s+/)
      .filter(w => /^[a-zA-Z]+$/.test(w))
  )];
  console.log('词表单词数:', words.length, '| 音色:', VOICE, '| 区域:', REGION);

  /* 收集所有音节（去重） */
  const syls = new Map();   // arpa -> {text}
  for(const w of words){
    const res = analyze(w);
    if(!res) continue;
    res.sylls.forEach(s => {
      const arpa = toArpabet(s.ipa);
      if(arpa && !syls.has(arpa)) syls.set(arpa, s.text);
    });
  }
  console.log('去重后音节数:', syls.size);
  if(DRY){
    console.log('音节清单（ARPAbet | 拼写）:');
    [...syls.entries()].slice(0, 40).forEach(([arpa, text]) => console.log('  ' + arpa.padEnd(22) + ' ' + text));
    console.log(DRY && syls.size > 40 ? '  ...(仅显示前40个)' : '');
    console.log('[dry-run] 未调用接口。');
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  let done = 0, skip = 0, fail = 0;

  if(PHONEMES_MODE){
    /* 单音素模式：为 48 个音素各生成一个 SIS 发音（点单个音标时播放） */
    for(const ph of ENGINE.PHONEMES){
      const arpa = toArpabet([ph]);
      const file = path.join(OUT, 'PH_' + arpa.replace(/\s+/g, '_') + '.mp3');
      if(fs.existsSync(file)){ skip++; continue; }
      try{
        const mp3 = await huaweiTts(arpa, 'syl');
        fs.writeFileSync(file, mp3);
        done++;
        process.stdout.write('\r已生成 ' + done + ' / 跳过 ' + skip + ' / 失败 ' + fail + '   ');
      }catch(e){
        fail++;
        console.error('\n✗ 音素 ' + ph + ' (' + arpa + '): ' + String(e.message || e).slice(0, 140));
        if(fail >= 5){ console.error('连续失败过多，已中止。'); process.exit(1); }
      }
    }
    console.log('\n完成！音素文件共生成 ' + done + ' 个，跳过 ' + skip + ' 个，失败 ' + fail + ' 个。');
    return;
  }

  for(const [arpa, text] of syls){
    const file = path.join(OUT, arpa.replace(/\s+/g, '_') + '.mp3');
    if(fs.existsSync(file)){ skip++; continue; }
    try{
      const mp3 = await huaweiTts(arpa, text);
      fs.writeFileSync(file, mp3);
      done++;
      process.stdout.write('\r已生成 ' + done + ' / 跳过 ' + skip + ' / 失败 ' + fail + '   ');
    }catch(e){
      fail++;
      console.error('\n✗ ' + arpa + ' (' + text + '): ' + String(e.message || e).slice(0, 140));
      if(fail >= 5){ console.error('连续失败过多，请检查 AK/SK/项目ID/服务是否开通，已中止。'); process.exit(1); }
    }
  }
  console.log('\n完成！共生成 ' + done + ' 个音节音频，跳过 ' + skip + ' 个已存在文件，失败 ' + fail + ' 个。');
  console.log('文件位置:', OUT);
  console.log('最后一步：App 里点 ⚙ 语音设置 → 选「本地音节库」保存即可。');
}
main().catch(e => { console.error('运行失败:', e); process.exit(1); });
