/* /api/units —— 单元管理
   GET  列出全部单元（含词数）
   POST 创建单元并批量入库单词 body: {name, text}（text 按非字母切分） */
import { getPool, ensureSchema, dbErrorResponse } from '@/lib/db';

export async function GET(){
  try{
    await ensureSchema();
    const r = await getPool().query(
      `SELECT u.id, u.name, u.created_at, COUNT(w.id)::int AS count
       FROM units u LEFT JOIN words w ON w.unit_id = u.id
       GROUP BY u.id ORDER BY u.created_at DESC`
    );
    return Response.json(r.rows);
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

    const pool = getPool();
    const client = await pool.connect();
    try{
      await client.query('BEGIN');
      const dup = await client.query('SELECT id FROM units WHERE name = $1', [name]);
      if(dup.rows.length){
        await client.query('ROLLBACK');
        return Response.json({error: `单元「${name}」已存在，请换一个名称`}, {status: 409});
      }
      const u = await client.query('INSERT INTO units(name) VALUES($1) RETURNING id', [name]);
      const uid = u.rows[0].id;
      const values = [], params = [];
      words.forEach((w, i) => {
        values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
        params.push(uid, w);
      });
      await client.query(`INSERT INTO words(unit_id, word) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`, params);
      await client.query('COMMIT');
      return Response.json({ok: true, id: uid, name, added: words.length});
    }catch(e){
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }finally{
      client.release();
    }
  }catch(e){ return dbErrorResponse(e); }
}
