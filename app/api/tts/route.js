/* POST /api/tts —— 华为云 SIS 实时合成代理（浏览器同源调用，绕开 CORS 限制）
   body: {"arpa":"K AA1 M","text":"com","file":"K_AA1_M.mp3"}
   返回 audio/mp3；结果落盘缓存到 public/syllables/<file>，下次直接静态秒播 */
import fs from 'fs';
import path from 'path';
import { loadSisConfig, sisTts } from '@/lib/sis';

const SYL_DIR = path.join(process.cwd(), 'public', 'syllables');

export async function POST(req){
  let body;
  try{ body = await req.json(); }
  catch(e){ return Response.json({error: 'bad json'}, {status: 400}); }
  const { arpa, text, file } = body || {};

  if(!arpa || !/^[A-Za-z0-9 ]+$/.test(arpa))
    return Response.json({error: 'bad arpa'}, {status: 400});

  const safeName = (file || arpa.replace(/\s+/g, '_') + '.mp3').replace(/[^A-Za-z0-9_.-]/g, '');
  const diskFile = path.join(SYL_DIR, safeName);

  try{
    fs.mkdirSync(SYL_DIR, { recursive: true });
    /* 已有缓存直接返回 */
    if(fs.existsSync(diskFile)){
      const buf = fs.readFileSync(diskFile);
      return new Response(buf, {headers: {'Content-Type': 'audio/mpeg', 'X-Cache': 'disk'}});
    }
    const cfg = loadSisConfig();
    const mp3 = await sisTts(cfg, arpa, text);
    try{ fs.writeFileSync(diskFile, mp3); }catch(e){ /* 只读目录时仅不缓存 */ }
    return new Response(mp3, {headers: {'Content-Type': 'audio/mpeg', 'X-Cache': 'sis'}});
  }catch(e){
    return Response.json({error: String(e.message || e).slice(0, 160)}, {status: 502});
  }
}
