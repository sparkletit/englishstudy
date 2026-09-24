/* POST /api/tts —— 华为云 SIS 实时合成代理（浏览器同源调用，绕开 CORS 限制）
   body: {"arpa":"K AA1 M","text":"com","file":"K_AA1_M.mp3"}
   返回 audio/mp3；结果落盘缓存：
     云端（Workers）→ R2 存储桶 SYL_CACHE；本机 → public/syllables/（静态秒播） */
import fs from 'fs';
import path from 'path';
import { loadSisConfig, sisTts } from '@/lib/sis';

const SYL_DIR = path.join(process.cwd(), 'public', 'syllables');

/* 缓存读写：R2 优先（云端），失败回退磁盘（本机），再失败返回 null */
async function cacheGet(name){
  const r2 = process.env.SYL_CACHE;
  if(r2 && r2.get){
    try{ const o = await r2.get('syllables/' + name); if(o) return new Uint8Array(await o.arrayBuffer()); }catch(e){}
    return null;
  }
  try{
    const f = path.join(SYL_DIR, name);
    if(fs.existsSync(f)) return new Uint8Array(fs.readFileSync(f));
  }catch(e){}
  return null;
}
async function cachePut(name, bytes){
  const r2 = process.env.SYL_CACHE;
  if(r2 && r2.put){
    try{ await r2.put('syllables/' + name, bytes); }catch(e){}
    return;
  }
  try{ fs.mkdirSync(SYL_DIR, {recursive: true}); fs.writeFileSync(path.join(SYL_DIR, name), bytes); }catch(e){}
}

export async function POST(req){
  let body;
  try{ body = await req.json(); }
  catch(e){ return Response.json({error: 'bad json'}, {status: 400}); }
  const { arpa, text, file } = body || {};

  if(!arpa || !/^[A-Za-z0-9 ]+$/.test(arpa))
    return Response.json({error: 'bad arpa'}, {status: 400});

  const safeName = (file || arpa.replace(/\s+/g, '_') + '.mp3').replace(/[^A-Za-z0-9_.-]/g, '');

  try{
    const cached = await cacheGet(safeName);
    if(cached){
      return new Response(cached, {headers: {'Content-Type': 'audio/mpeg', 'X-Cache': 'hit'}});
    }
    const cfg = loadSisConfig();
    const mp3 = await sisTts(cfg, arpa, text);
    await cachePut(safeName, mp3);
    return new Response(mp3, {headers: {'Content-Type': 'audio/mpeg', 'X-Cache': 'miss'}});
  }catch(e){
    return Response.json({error: String(e.message || e).slice(0, 160)}, {status: 502});
  }
}
