/* 从 index.html 提取引擎代码并批量测试 */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if(!m){ console.error('ENGINE block not found'); process.exit(1); }
const ENGINE = new Function(m[1].replace("'use strict';", '') + '\nreturn {analyze, analyzeCore, parseIPA, markTypes};')();
const analyze = ENGINE.analyze;

/* 校验音标是否都有对应音频文件 */
const VALID = new Set(require('fs').readdirSync(__dirname + '/assets/phonetic').map(f => f.replace('.mp3','')));
function badPhonemes(r){
  return r.sylls.flatMap(s => s.ipa).filter(p => !VALID.has(p));
}

const WORDS = process.argv[2] ? process.argv[2].split(',') : [
  // 基础规则词
  'student','open','paper','tiger','music','robot','seven',
  'letter','winter','sister','master','rabbit','happy','sunny','dollar',
  'chicken','kitchen','monkey','monster','secret','africa','magnet','cargo',
  'mother','brother','teacher','weather','feather',
  'table','apple','little','candle','simple','maple','cycle','eagle','struggle','jungle','middle',
  'banana','computer','elephant','family','animal','alphabet','important','understand',
  'beautiful','station','nation','education','picture','careful','famous','dangerous',
  'reading','making','going','running','wanted','played','boiled','walked','needed','danced',
  'boxes','watches','goes','makes','faces','changes','apples','cats','dogs','sees',
  'cake','nose','side','theme','these','peace','house','take','five','nine','home','cute','rule','true','june',
  'change','strange','bridge','edge','judge','prince','dance','taste','paste','sponge',
  'care','more','fire','pure','here','store','hardware',
  'car','her','for','market','horse','nurse',
  'night','light','high','know','snow','yellow','window','tomorrow','down','town','flower','power',
  'grew','blew','new','few','book','look','foot','good',
  'think','thank','math','this','that','three','breathe',
  'exit','extra','queen','quite','quick','study','bubble','puzzle','hundred','birthday','playground',
  'instrument','orchard','orange','village','english','england','angel','singer','finger','danger',
  'today','away','hello','yellow','zebra','potato','tomato','about','above','hotel','only',
  'yes','yesterday','my','by','cry','baby','july','gym','system',
  'lion','piano','diet','quiet','science','idea','create','real',
  'telephone','television','museum','saturday','monday','sunday',
  'sugar','sure','usually','super','music','human','duty',
  'an','and','cat','dog','sit','hot','cup','leg','big',
];

const BAD = [];
for(const w of WORDS){
  const r = analyze(w);
  if(!r){ console.log(w.padEnd(14), '-> (null)'); BAD.push(w); continue; }
  const parts = r.sylls.map((s,i) => s.text + '[' + s.ipa.join('') + ']').join('-');
  const bad = badPhonemes(r);
  const ok = r.sylls.every(s => s.ipa.length > 0) && r.sylls.map(s=>s.text).join('') === w && bad.length === 0;
  if(!ok) BAD.push(w);
  console.log(w.padEnd(14), '->', parts, ' 重音:', r.stress + 1, bad.length ? '  缺音频:' + bad.join(',') : '');
}
console.log('\n可疑词:', BAD.join(', ') || '无');
