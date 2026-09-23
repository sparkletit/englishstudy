#!/usr/bin/env node
/* 引擎回归测试：验证音节划分拼回原词、IPA 音素合法。
   用法：node tools/test-engine.mjs [word1 word2 ...]  （无参数时跑内置词表） */
import { analyze, PHONEMES } from '../lib/engine.js';

const args = process.argv.slice(2).filter(w => /^[a-zA-Z]+$/.test(w));
const WORDS = args.length ? args : `student beautiful computer elephant station water little
table apple cycle struggle jungle reading making played boxes watches compromise chicken
vacation umbrella important understand education carefully suddenly happiness teacher doctor`.split(/\s+/);

let bad = 0;
for(const w of WORDS){
  const res = analyze(w);
  if(!res){ console.log('✗', w, '引擎返回空'); bad++; continue; }
  const joined = res.sylls.map(s => s.text).join('');
  const unknown = res.sylls.flatMap(s => s.ipa).filter(p => !PHONEMES.includes(p));
  const flag = joined !== w ? ' [拼回不符: ' + joined + ']' : unknown.length ? ' [未知音素: ' + unknown.join(',') + ']' : '';
  if(flag) bad++;
  console.log((flag ? '✗' : '✓'), w.padEnd(14), '->', res.sylls.map(s => s.text + '[' + s.ipa.join('') + ']').join('-'), '重音:', res.stress, flag);
}
console.log(bad ? '\n存在问题: ' + bad : '\n全部通过');
process.exit(bad ? 1 : 0);
