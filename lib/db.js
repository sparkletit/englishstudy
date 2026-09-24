/* 单词库数据访问层（DAL）
   云端：Supabase REST（PostgREST，HTTP 无连接状态，Workers 上最稳）
   本机：podman PostgreSQL（node-postgres，配置读 sis-config.json 的 db 段）
   云端用 SUPABASE_URL + SUPABASE_SERVICE_KEY（wrangler vars/secret），本机自动走本地库。 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';

/* ---------- 环境与后端选择 ---------- */
function supaEnv(){
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  return (url && key) ? {url, key} : null;
}
const isCloud = () => !!supaEnv();

/* ---------- 本机 PG 基础设施 ---------- */
function loadDbConfig(){
  try{
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'sis-config.json'), 'utf8'));
    if(cfg.db) return cfg.db;
  }catch(e){}
  return { host: '127.0.0.1', port: 5432, user: 'syl', password: 'syl', database: 'syl' };
}
async function withClient(fn){
  const c0 = loadDbConfig();
  const client = new pg.Client({host: c0.host, port: c0.port, user: c0.user, password: c0.password, database: c0.database});
  client.on('error', () => {});
  await client.connect();
  try{ return await fn(client); }
  finally{ client.end().catch(() => {}); }
}

/* ---------- Supabase REST 基础设施 ---------- */
async function rest(path, {method = 'GET', body = null, query = ''} = {}){
  const {url, key} = supaEnv();
  const r = await fetch(url.replace(/\/$/, '') + '/rest/v1' + path + query, {
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if(!r.ok){
    const t = await r.text().catch(() => '');
    throw new Error('Supabase ' + r.status + ' ' + t.slice(0, 90));
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : null;
}

/* ---------- 对外接口 ---------- */
export async function ensureSchema(){
  if(isCloud()) return;   /* 云端表已建（首次由本机模式或 SQL 建好） */
  await withClient(async c => {
    await c.query(`CREATE TABLE IF NOT EXISTS units(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await c.query(`CREATE TABLE IF NOT EXISTS words(
      id SERIAL PRIMARY KEY,
      unit_id INT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      UNIQUE(unit_id, word)
    )`);
  });
}

export async function listUnits(){
  if(isCloud()){
    const rows = await rest('/units', {query: '?select=id,name,created_at,words(id)&order=created_at.desc'});
    return rows.map(r => ({id: r.id, name: r.name, created_at: r.created_at, count: (r.words || []).length}));
  }
  const r = await withClient(c => c.query(
    `SELECT u.id, u.name, u.created_at, COUNT(w.id)::int AS count
     FROM units u LEFT JOIN words w ON w.unit_id = u.id
     GROUP BY u.id ORDER BY u.created_at DESC`));
  return r.rows;
}

/* 返回 {ok,id,name,added} 或抛 DuplicateError */
export class DuplicateError extends Error{}
export async function createUnit(name, words){
  if(isCloud()){
    const dup = await rest('/units', {query: '?select=id&name=eq.' + encodeURIComponent(name)});
    if(dup.length) throw new DuplicateError(`单元「${name}」已存在，请换一个名称`);
    const [u] = await rest('/units', {method: 'POST', body: {name}});
    try{
      await rest('/words', {method: 'POST', body: words.map(w => ({unit_id: u.id, word: w}))});
    }catch(e){
      await rest('/units', {method: 'DELETE', query: '?id=eq.' + u.id});
      throw e;
    }
    return {ok: true, id: u.id, name, added: words.length};
  }
  return withClient(async client => {
    await client.query('BEGIN');
    try{
      const dup = await client.query('SELECT id FROM units WHERE name = $1', [name]);
      if(dup.rows.length) throw new DuplicateError(`单元「${name}」已存在，请换一个名称`);
      const u = await client.query('INSERT INTO units(name) VALUES($1) RETURNING id', [name]);
      const uid = u.rows[0].id;
      const values = [], params = [];
      words.forEach((w, i) => {
        values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
        params.push(uid, w);
      });
      await client.query(`INSERT INTO words(unit_id, word) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`, params);
      await client.query('COMMIT');
      return {ok: true, id: uid, name, added: words.length};
    }catch(e){
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
  });
}

export async function getUnit(uid){
  if(isCloud()){
    const [u] = await rest('/units', {query: '?select=id,name&id=eq.' + uid});
    if(!u) return null;
    const ws = await rest('/words', {query: '?select=word&unit_id=eq.' + uid + '&order=id'});
    return {id: uid, name: u.name, words: ws.map(r => r.word)};
  }
  return withClient(async c => {
    const u = await c.query('SELECT id, name FROM units WHERE id = $1', [uid]);
    if(!u.rows.length) return null;
    const w = await c.query('SELECT word FROM words WHERE unit_id = $1 ORDER BY id', [uid]);
    return {id: uid, name: u.rows[0].name, words: w.rows.map(r => r.word)};
  });
}

export async function deleteUnit(uid){
  if(isCloud()){
    await rest('/units', {method: 'DELETE', query: '?id=eq.' + uid});
    return;
  }
  await withClient(c => c.query('DELETE FROM units WHERE id = $1', [uid]));
}

/* 统一错误响应 */
export function dbErrorResponse(e){
  const msg = String(e.message || e);
  const hint = /ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)
    ? '数据库连接失败：本机先运行 npm run db:start'
    : msg.slice(0, 120);
  return Response.json({error: hint}, {status: e instanceof DuplicateError ? 409 : 503});
}
