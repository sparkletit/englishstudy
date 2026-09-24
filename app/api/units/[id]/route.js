/* /api/units/[id]
   GET    返回单元全部单词 {id, name, words:[...]}
   DELETE 删除单元（级联删词） */
import { getPool, ensureSchema, dbErrorResponse } from '@/lib/db';

export async function GET(req, { params }){
  try{
    await ensureSchema();
    const { id } = await params;
    const uid = parseInt(id, 10);
    if(!Number.isInteger(uid)) return Response.json({error: 'bad id'}, {status: 400});
    const u = await getPool().query('SELECT id, name FROM units WHERE id = $1', [uid]);
    if(!u.rows.length) return Response.json({error: '单元不存在'}, {status: 404});
    const w = await getPool().query('SELECT word FROM words WHERE unit_id = $1 ORDER BY id', [uid]);
    return Response.json({id: uid, name: u.rows[0].name, words: w.rows.map(r => r.word)});
  }catch(e){ return dbErrorResponse(e); }
}

export async function DELETE(req, { params }){
  try{
    await ensureSchema();
    const { id } = await params;
    const uid = parseInt(id, 10);
    if(!Number.isInteger(uid)) return Response.json({error: 'bad id'}, {status: 400});
    await getPool().query('DELETE FROM units WHERE id = $1', [uid]);
    return Response.json({ok: true});
  }catch(e){ return dbErrorResponse(e); }
}
