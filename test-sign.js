/* 验证 gen-syllables.js 的华为云签名与官方 SDK 输出逐字节一致 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/gen-syllables.js', 'utf8');
const m1 = src.match(/async function sha256Hex[\s\S]*?\n\}/);
const m2 = src.match(/async function hmacHex[\s\S]*?\n\}/);
const m3 = src.match(/async function hwsSign[\s\S]*?\n\}/);
if(!m1 || !m2 || !m3){ console.error('未找到签名函数'); process.exit(1); }
const preamble = "const subtle = globalThis.__crypto.webcrypto.subtle; const TE = new TextEncoder();";
globalThis.__crypto = require('crypto');
const hwsSign = new Function(preamble + '\n' + m1[0] + '\n' + m2[0] + '\n' + m3[0] + '\nreturn hwsSign;')();
const AKSKSigner = require('C:/Users/jared/node_modules/@huaweicloud/huaweicloud-sdk-core/auth/AKSKSigner.js').AKSKSigner;

(async () => {
  const bodyObj = { text: '<speak>It is <phoneme ph="B Y UW1">beau</phoneme>.</speak>',
    config: { audio_format: 'mp3', sample_rate: '16000', property: 'chinese_huaxiaomei_common', speed: 0, pitch: 0, volume: 50 } };
  const url = 'https://sis-ext.cn-north-4.myhuaweicloud.com/v1/06d5c8f23c8010e01f62c00cc5d2a4f0/tts';
  const dateStr = '20260923T060000Z';
  const cred = { getAk: () => 'AKTEST123', getSk: () => 'SKTEST456' };
  const official = AKSKSigner.sign({ method: 'POST', endpoint: url, headers: { 'content-type': 'application/json', 'X-Sdk-Date': dateStr }, data: bodyObj }, cred);
  const mine = await hwsSign('AKTEST123', 'SKTEST456', 'POST', new URL(url), JSON.stringify(bodyObj), new Date(Date.UTC(2026, 8, 23, 6, 0, 0)));
  console.log('官方:', official.Authorization);
  console.log('我的 :', mine.Authorization);
  const ok = official.Authorization === mine.Authorization;
  console.log(ok ? '✅ 签名与官方 SDK 逐字节一致' : '❌ 不一致');
  process.exit(ok ? 0 : 1);
})();
