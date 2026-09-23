#!/usr/bin/env node
/**
 * server.js —— 本地开发服务器：静态文件 + 华为云 SIS 实时合成代理
 *
 *   静态：  http://127.0.0.1:8123/index.html        （手机可用 http://电脑局域网IP:8123）
 *   代理：  POST /api/tts  body: {"arpa":"K AA1 M","text":"com","file":"K_AA1_M.mp3"}
 *           → 调华为云 SIS 合成（音色/音量见 sis-config.json），返回 audio/mp3，
 *             并落盘缓存到 assets/syllables/<file>，之后再请求同音节直接读本地文件。
 *
 *   密钥放在 sis-config.json（本文件服务器会拒绝下发该文件），不会进入网页代码。
 *   启动：  node server.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;
const TE = new TextEncoder();

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'sis-config.json'), 'utf8'));
const PORT = CFG.port || 8123;
const SYL_DIR = path.join(__dirname, 'assets', 'syllables');

/* ---------- 华为云签名（与 gen-syllables.js 相同，已对官方 SDK 验证） ---------- */
async function sha256Hex(s){
  const d = await subtle.digest('SHA-256', TE.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(key, msg){
  const k = await subtle.importKey('raw', TE.encode(key), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = await subtle.sign('HMAC', k, TE.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hwsSign(ak, sk, method, u, bodyStr){
  const p2 = n => String(n).padStart(2, '0');
  const now = new Date();
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

/* ---------- SIS 合成（含 SIS.0419 中性内文重试） ---------- */
async function sisTtsOnce(ssml){
  const body = JSON.stringify({ text: ssml, config: {
    audio_format: 'mp3', sample_rate: '16000', property: CFG.voice,
    speed: 0, pitch: 0, volume: CFG.volume == null ? 80 : CFG.volume } });
  const urlStr = 'https://sis-ext.' + CFG.region + '.myhuaweicloud.com/v1/' + CFG.pid + '/tts';
  const u = new URL(urlStr);
  const headers = await hwsSign(CFG.ak, CFG.sk, 'POST', u, body);
  const r = await fetch(urlStr, { method: 'POST', headers: Object.assign({'Content-Type': 'application/json'}, headers), body });
  const text = await r.text();
  let j = null;
  try{ j = JSON.parse(text); }catch(e){}
  if(!r.ok || !j || !j.result || !j.result.data){
    const err = new Error((j && (j.error_code + ' ' + j.error_msg)) || ('HTTP ' + r.status + ' ' + text.slice(0, 80)));
    err.code = j && j.error_code;
    throw err;
  }
  return Buffer.from(j.result.data, 'base64');
}
async function sisTts(arpa, innerText){
  const inner = innerText && /^[a-z]+$/i.test(innerText) ? innerText : 'syl';
  try{
    return await sisTtsOnce('<speak><phoneme ph="' + arpa + '">' + inner + '</phoneme></speak>');
  }catch(e){
    if(e.code === 'SIS.0419')  /* 个别拼写触发文本规范化错误，换中性内文 */
      return await sisTtsOnce('<speak><phoneme ph="' + arpa + '">syl</phoneme></speak>');
    throw e;
  }
}

/* ---------- 静态文件 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
function serveStatic(req, res, pathname){
  if(pathname === '/') pathname = '/index.html';
  /* 密钥文件禁止下发 */
  if(pathname === '/sis-config.json'){ res.writeHead(403); res.end('Forbidden'); return; }
  const file = path.normalize(path.join(__dirname, decodeURIComponent(pathname)));
  if(!file.startsWith(__dirname)){ res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(file, (err, st) => {
    if(err || !st.isFile()){ res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- 服务 ---------- */
fs.mkdirSync(SYL_DIR, { recursive: true });
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if(req.method === 'POST' && u.pathname === '/api/tts'){
    try{
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const { arpa, text, file } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if(!arpa || !/^[A-Za-z0-9 ]+$/.test(arpa)){ res.writeHead(400); res.end('bad arpa'); return; }
      const safeName = (file || arpa.replace(/\s+/g, '_') + '.mp3').replace(/[^A-Za-z0-9_.-]/g, '');
      const diskFile = path.join(SYL_DIR, safeName);
      /* 已有缓存直接返回 */
      if(fs.existsSync(diskFile)){
        const buf = fs.readFileSync(diskFile);
        res.writeHead(200, {'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'X-Cache': 'disk'});
        res.end(buf); return;
      }
      const mp3 = await sisTts(arpa, text);
      try{ fs.writeFileSync(diskFile, mp3); }catch(e){ /* 只读目录时仅不缓存 */ }
      res.writeHead(200, {'Content-Type': 'audio/mpeg', 'Content-Length': mp3.length, 'X-Cache': 'sis'});
      res.end(mp3);
    }catch(e){
      console.error('[tts]', String(e.message || e).slice(0, 160));
      res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('SIS synth failed: ' + String(e.message || e).slice(0, 160));
    }
    return;
  }
  serveStatic(req, res, u.pathname);
});
server.listen(PORT, () => {
  console.log('音节划分器服务已启动: http://127.0.0.1:' + PORT + '/  （手机访问用本机局域网 IP 同端口）');
  console.log('SIS 配置: 区域=' + CFG.region + ' 音色=' + CFG.voice + ' 音量=' + (CFG.volume == null ? 80 : CFG.volume));
});
