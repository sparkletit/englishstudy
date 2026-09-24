/* PostgreSQL 连接池 + 建表（配置读 sis-config.json 的 db 段，容器由 tools/db.mjs 管理） */
import pg from 'pg';
import fs from 'fs';
import path from 'path';

function loadDbConfig(){
  try{
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'sis-config.json'), 'utf8'));
    if(cfg.db) return cfg.db;
  }catch(e){}
  return { host: '127.0.0.1', port: 5432, user: 'syl', password: 'syl', database: 'syl' };
}

let pool = null;
export function getPool(){
  if(!pool){
    /* 云端：Hyperdrive 绑定（Workers，连 Supabase）；本机：sis-config.json 的 db 段（podman PG） */
    const hd = process.env.HYPERDRIVE;
    if(hd && hd.connectionString){
      pool = new pg.Pool({ connectionString: hd.connectionString, max: 5 });
    }else{
      const c = loadDbConfig();
      pool = new pg.Pool({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database, max: 5 });
    }
    pool.on('error', () => {});   /* 空闲连接断开不崩进程 */
  }
  return pool;
}

let schemaReady = null;
export async function ensureSchema(){
  if(!schemaReady){
    schemaReady = (async () => {
      const q = getPool().query.bind(getPool());
      await q(`CREATE TABLE IF NOT EXISTS units(
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await q(`CREATE TABLE IF NOT EXISTS words(
        id SERIAL PRIMARY KEY,
        unit_id INT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        UNIQUE(unit_id, word)
      )`);
    })().catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

/* 数据库未就绪时的统一错误响应 */
export function dbErrorResponse(e){
  const msg = String(e.message || e);
  const hint = /ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)
    ? '数据库未启动：先运行 npm run db:start（或检查 PostgreSQL 容器）'
    : msg.slice(0, 120);
  return Response.json({error: hint}, {status: 503});
}
