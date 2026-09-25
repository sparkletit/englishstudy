#!/usr/bin/env node
/**
 * tools/import-xlsx.mjs —— 从 Excel 单词表批量导入单元
 *
 *   node tools/import-xlsx.mjs <词表.xlsx> [--url http://127.0.0.1:8123] [--url https://e.elpf.tech] [--sheet 按Unit分类]
 *
 * 表格式（人教版单词表）：列 = 序号 | 单元 | 单词/短语 | 音标 | 词性 | 释义
 * 按「单元」列分组创建单元；短语（含空格/斜杠等非字母字符）自动跳过。
 * 可多次 --url 同时导入多个环境。
 */
import { readFile } from 'fs/promises';
import XLSX from 'xlsx';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && /\.(xlsx|xls)$/i.test(a));
const urls = [];
for(let i = 0; i < args.length; i++){ if(args[i] === '--url') urls.push(args[i + 1]); }
const sheetIdx = args.indexOf('--sheet');
const sheetName = sheetIdx >= 0 ? args[sheetIdx + 1] : '按Unit分类';
const prefixIdx = args.indexOf('--prefix');
const prefix = prefixIdx >= 0 ? (args[prefixIdx + 1] || '') : '';

if(!file || !urls.length){
  console.error('用法: node tools/import-xlsx.mjs 词表.xlsx --url http://127.0.0.1:8123 [--url https://...] [--sheet 表名] [--prefix 前缀]');
  process.exit(1);
}

const wb = XLSX.read(await readFile(file));
if(!wb.SheetNames.includes(sheetName)){
  console.error('找不到工作表 ' + sheetName + '，现有: ' + wb.SheetNames.join(' | '));
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header: 1});

/* 按「单元」列分组（第2列），只收纯字母单词（第3列） */
const groups = new Map();
let skipped = 0;
for(const r of rows.slice(1)){
  const unit = String(r[1] || '').trim();
  const word = String(r[2] || '').trim().toLowerCase();
  if(!unit || !word) continue;
  if(!/^[a-z]{1,30}$/.test(word)){ skipped++; continue; }
  if(!groups.has(unit)) groups.set(unit, new Set());
  groups.get(unit).add(word);
}
console.log(`解析完成：${groups.size} 个单元，${[...groups.values()].reduce((s, g) => s + g.size, 0)} 个单词，跳过 ${skipped} 个短语`);

for(const url of urls){
  console.log('\n=== 导入到 ' + url + ' ===');
  /* 先清空该环境现有单元 */
  const olds = await fetch(url + '/api/units').then(r => r.json()).then(d => Array.isArray(d) ? d : []).catch(() => []);
  for(const u of olds){
    await fetch(url + '/api/units/' + u.id, {method: 'DELETE'});
  }
  if(olds.length) console.log('已清空原单元 ' + olds.length + ' 个');

  let done = 0;
  for(const [name, words] of groups){
    const fullName = prefix + name;
    const r = await fetch(url + '/api/units', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: fullName, text: [...words].join(' ')})
    });
    const j = await r.json().catch(() => ({}));
    if(r.ok){ done++; console.log(`  ✓ ${fullName}（${j.added} 词）`); }
    else console.log(`  ✗ ${fullName}: ${j.error || r.status}`);
  }
  const list = await fetch(url + '/api/units').then(r => r.json()).catch(() => []);
  const total = list.reduce((s, u) => s + u.count, 0);
  console.log(`完成：${done}/${groups.size} 单元，共 ${total} 词`);
}
