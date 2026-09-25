/* /api/units/[id]
   GET    返回单元全部单词 {id, name, words:[...]}
   PATCH  重命名 body: {name}
   DELETE 删除单元（级联删词） */
import { ensureSchema, getUnit, deleteUnit, renameUnit, dbErrorResponse } from '@/lib/db';

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

export async function PATCH(req, { params }){
  try{
    await ensureSchema();
    const { id } = await params;
    const uid = parseInt(id, 10);
    if(!Number.isInteger(uid)) return Response.json({error: 'bad id'}, {status: 400});
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 40);
    if(!name) return Response.json({error: '请填写单元名称'}, {status: 400});
    if(!(await getUnit(uid))) return Response.json({error: '单元不存在'}, {status: 404});
    await renameUnit(uid, name);
    return Response.json({ok: true, name});
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
