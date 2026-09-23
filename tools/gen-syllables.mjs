#!/usr/bin/env node
/**
 * tools/gen-syllables.mjs —— 华为云 SIS 批量生成音节/音素发音库
 *
 * 读取词表 → 用 lib/engine.js 拆分音节 → IPA 转 ARPAbet → 调华为云 SIS 合成
 * → 保存到 public/syllables/（Next.js 静态目录，App 直接播放）。
 *
 * 密钥默认读项目根目录 sis-config.json（ak/sk/pid/region/voice/volume），也可用参数覆盖。
 *
 * 用法：
 *   node tools/gen-syllables.mjs [--words 词表.txt] [--dry] [--phonemes]
 *   npm run gen -- --words 词表.txt
 *
 *   --dry       只列出词表的音节清单，不调用接口
 *   --phonemes  生成 44 个单音素文件（PH_*.mp3，点单个音标时播放）
 *   --ak/--sk/--pid/--region/--voice  覆盖 sis-config.json 中的对应项
 *
 * 词表格式：每行或空格分隔的英文单词（# 开头为注释）。不给 --words 时使用内置常用校园词表。
 * 已存在的同名文件会跳过，可反复运行增量补充。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyze, PHONEMES } from '../lib/engine.js';
import { loadSisConfig, sisTts } from '../lib/sis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/* ---------- 参数 ---------- */
const args = {};
process.argv.slice(2).forEach((a, i, arr) => { if(a.startsWith('--')) args[a.slice(2)] = arr[i + 1]; });
const DRY = process.argv.includes('--dry');
const PHONEMES_MODE = process.argv.includes('--phonemes');
const WORDS_FILE = args.words;

const fileCfg = loadSisConfig(ROOT);
const AK = args.ak || fileCfg.ak;
const SK = args.sk || fileCfg.sk;
const PID = args.pid || fileCfg.pid;
const REGION = args.region || fileCfg.region || 'cn-east-3';
const VOICE = args.voice || fileCfg.voice || 'english_alvin_common';
const CFG = { ak: AK, sk: SK, pid: PID, region: REGION, voice: VOICE, volume: fileCfg.volume };
const OUT = path.join(ROOT, 'public', 'syllables');

if(!AK || !SK || !PID){
  console.error('缺少密钥：请在 sis-config.json 配置 ak/sk/pid，或用 --ak/--sk/--pid 传入。');
  process.exit(1);
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

/* ---------- IPA → ARPAbet（与 app/page.jsx 保持一致） ---------- */
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

/* ---------- 主流程 ---------- */
const words = [...new Set(
  (WORDS_FILE ? fs.readFileSync(WORDS_FILE, 'utf8') : DEFAULT_WORDS)
    .split(/[\r\n#]+/).join(' ').split(/\s+/)
    .filter(w => /^[a-zA-Z]+$/.test(w))
)];
console.log('词表单词数:', words.length, '| 音色:', VOICE, '| 区域:', REGION);

const syls = new Map();   /* arpa -> 音节拼写 */
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
  if(syls.size > 40) console.log('  ...(仅显示前40个)');
  console.log('[dry-run] 未调用接口。');
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
let done = 0, skip = 0, fail = 0;

async function genOne(arpa, text, file){
  if(fs.existsSync(file)){ skip++; return; }
  try{
    const mp3 = await sisTts(CFG, arpa, text);
    fs.writeFileSync(file, mp3);
    done++;
    process.stdout.write('\r已生成 ' + done + ' / 跳过 ' + skip + ' / 失败 ' + fail + '   ');
  }catch(e){
    fail++;
    console.error('\n✗ ' + arpa + ' (' + text + '): ' + String(e.message || e).slice(0, 140));
    if(fail >= 5){ console.error('连续失败过多，请检查密钥/服务是否开通，已中止。'); process.exit(1); }
  }
}

if(PHONEMES_MODE){
  /* 单音素模式：ts/dz/tr/dr 为旧录音集遗留，引擎不会输出，自动跳过 */
  for(const ph of PHONEMES){
    const arpa = toArpabet([ph]);
    if(!arpa){ console.log('跳过无 ARPAbet 对应的音素: ' + ph); continue; }
    await genOne(arpa, 'syl', path.join(OUT, 'PH_' + arpa.replace(/\s+/g, '_') + '.mp3'));
  }
}else{
  for(const [arpa, text] of syls){
    await genOne(arpa, text, path.join(OUT, arpa.replace(/\s+/g, '_') + '.mp3'));
  }
}
console.log('\n完成！共生成 ' + done + ' 个音频，跳过 ' + skip + ' 个已存在文件，失败 ' + fail + ' 个。');
console.log('文件位置:', OUT);
