/* 华为云 SIS 签名与合成（Node 端专用，供 app/api/tts 与工具脚本使用） */
import fs from 'fs';
import path from 'path';
import { webcrypto } from 'crypto';

const subtle = webcrypto.subtle;
const TE = new TextEncoder();

export function loadSisConfig(root){
  /* 云端（Workers）用环境变量，本机回退 sis-config.json */
  if(process.env.SIS_AK && process.env.SIS_SK && process.env.SIS_PID){
    return {
      ak: process.env.SIS_AK, sk: process.env.SIS_SK, pid: process.env.SIS_PID,
      region: process.env.SIS_REGION || 'cn-east-3',
      voice: process.env.SIS_VOICE || 'english_alvin_common',
      volume: process.env.SIS_VOLUME == null ? 80 : Number(process.env.SIS_VOLUME)
    };
  }
  return JSON.parse(fs.readFileSync(path.join(root || process.cwd(), 'sis-config.json'), 'utf8'));
}

async function sha256Hex(s){
  const d = await subtle.digest('SHA-256', TE.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(key, msg){
  const k = await subtle.importKey('raw', TE.encode(key), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = await subtle.sign('HMAC', k, TE.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/* 与官方 SDK AKSKSigner 输出逐字节一致（已验证） */
export async function hwsSign(ak, sk, method, u, bodyStr){
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

async function sisTtsOnce(cfg, ssml){
  const body = JSON.stringify({ text: ssml, config: {
    audio_format: 'mp3', sample_rate: '16000', property: cfg.voice,
    speed: 0, pitch: 0, volume: cfg.volume == null ? 80 : cfg.volume } });
  const urlStr = 'https://sis-ext.' + cfg.region + '.myhuaweicloud.com/v1/' + cfg.pid + '/tts';
  const u = new URL(urlStr);
  const headers = await hwsSign(cfg.ak, cfg.sk, 'POST', u, body);
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

/* 按 ARPAbet 合成一段发音；个别拼写触发 SIS.0419 时换中性内文重试（发音由 ph 属性决定） */
export async function sisTts(cfg, arpa, innerText){
  const inner = innerText && /^[a-z]+$/i.test(innerText) ? innerText : 'syl';
  try{
    return await sisTtsOnce(cfg, '<speak><phoneme ph="' + arpa + '">' + inner + '</phoneme></speak>');
  }catch(e){
    if(e.code === 'SIS.0419')
      return await sisTtsOnce(cfg, '<speak><phoneme ph="' + arpa + '">syl</phoneme></speak>');
    throw e;
  }
}
