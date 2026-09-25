/* /api/units/[id]/words —— 单元内单词编辑
   POST   body: {text} 追加单词（去重），返回 {added}
   DELETE ?word=apple 删除单个单词 */
import { ensureSchema, getUnit, addWords, removeWord, dbErrorResponse } from '@/lib/db';

export async function POST(req, { params }){
  try{
    await ensureSchema();
    const { id } = await params;
    const uid = parseInt(id, 10);
    if(!Number.isInteger(uid)) return Response.json({error: 'bad id'}, {status: 400});
    const body = await req.json().catch(() => ({}));
    const words = [...new Set(
      String(body.text || '').toLowerCase().split(/[^a-z]+/).filter(w => w && w.length <= 30)
    )].slice(0, 200);
    if(!words.length) return Response.json({error: '未识别到有效单词'}, {status: 400});
    if(!(await getUnit(uid))) return Response.json({error: '单元不存在'}, {status: 404});
    const added = await addWords(uid, words);
    return Response.json({ok: true, added});
  }catch(e){ return dbErrorResponse(e); }
}

export async function DELETE(req, { params }){
  try{
    await ensureSchema();
    const { id } = await params;
    const uid = parseInt(id, 10);
    const word = (new URL(req.url).searchParams.get('word') || '').toLowerCase();
    if(!Number.isInteger(uid) || !/^[a-z]{1,30}$/.test(word))
      return Response.json({error: 'bad request'}, {status: 400});
    await removeWord(uid, word);
    return Response.json({ok: true});
  }catch(e){ return dbErrorResponse(e); }
}
