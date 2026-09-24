/* /api/units —— 单元管理
   GET  列出全部单元（含词数）
   POST 创建单元并批量入库单词 body: {name, text}（text 按非字母切分） */
import { ensureSchema, listUnits, createUnit, dbErrorResponse } from '@/lib/db';

export async function GET(){
  try{
    await ensureSchema();
    return Response.json(await listUnits());
  }catch(e){ return dbErrorResponse(e); }
}

export async function POST(req){
  try{
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 40);
    const words = [...new Set(
      String(body.text || '').toLowerCase().split(/[^a-z]+/).filter(w => w && w.length <= 30)
    )].slice(0, 500);
    if(!name) return Response.json({error: '请填写单元名称'}, {status: 400});
    if(!words.length) return Response.json({error: '未识别到有效单词（仅支持英文字母）'}, {status: 400});
    const out = await createUnit(name, words);
    return Response.json(out);
  }catch(e){ return dbErrorResponse(e); }
}
