/* /api/units/[id]
   GET    返回单元全部单词 {id, name, words:[...]}
   DELETE 删除单元（级联删词） */
import { ensureSchema, getUnit, deleteUnit, dbErrorResponse } from '@/lib/db';

export async function GET(req, { params }){
  try{
    await ensureSchema();
    const { id } = await params;
    const uid = parseInt(id, 10);
    if(!Number.isInteger(uid)) return Response.json({error: 'bad id'}, {status: 400});
    const u = await getUnit(uid);
    if(!u) return Response.json({error: '单元不存在'}, {status: 404});
    return Response.json(u);
  }catch(e){ return dbErrorResponse(e); }
}

export async function DELETE(req, { params }){
  try{
    await ensureSchema();
    const { id } = await params;
    const uid = parseInt(id, 10);
    if(!Number.isInteger(uid)) return Response.json({error: 'bad id'}, {status: 400});
    await deleteUnit(uid);
    return Response.json({ok: true});
  }catch(e){ return dbErrorResponse(e); }
}
