/* PostgreSQL 访问（云端：Hyperdrive 绑定连 Supabase；本机：sis-config.json 的 db 段连 podman PG）
   注意：不用 pg.Pool——Hyperdrive 自带连接池，客户端长连接池叠加其上会因空闲连接被静默杀掉而挂死。 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { getCloudflareContext } from '@opennextjs/cloudflare';

function loadDbConfig(){
  try{
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'sis-config.json'), 'utf8'));
    if(cfg.db) return cfg.db;
  }catch(e){}
  return { host: '127.0.0.1', port: 5432, user: 'syl', password: 'syl', database: 'syl' };
}

/* Cloudflare 对象型绑定（Hyperdrive/R2）要用 getCloudflareContext().env 取；
   process.env 只有字符串型 vars/secrets。本机环境调用会抛错，捕获后走本地配置。 */
function cfBinding(name){
  try{
    const ctx = getCloudflareContext({async: false});
    return ctx && ctx.env ? ctx.env[name] : undefined;
  }catch(e){ return undefined; }
}

/* 每请求一个连接，用完即关 */
export async function withClient(fn){
  const hd = cfBinding('HYPERDRIVE') || process.env.HYPERDRIVE;
  const opts = (hd && hd.connectionString)
    ? {connectionString: hd.connectionString}
    : (() => { const c = loadDbConfig(); return {host: c.host, port: c.port, user: c.user, password: c.password, database: c.database}; })();
  const client = new pg.Client(opts);
  await client.connect();
  try{ return await fn(client); }
  finally{ client.end().catch(() => {}); }
}

let schemaReady = null;
export async function ensureSchema(){
  if(!schemaReady){
    schemaReady = withClient(async c => {
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
    }).catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

/* 数据库未就绪时的统一错误响应 */
export function dbErrorResponse(e){
  const msg = String(e.message || e);
  const hint = /ECONNREFUSED|ENOTFOUND|timeout|hung/i.test(msg)
    ? '数据库连接失败：云端检查 Hyperdrive/Supabase；本机先运行 npm run db:start'
    : msg.slice(0, 120);
  return Response.json({error: hint}, {status: 503});
}
