#!/usr/bin/env node
/**
 * tools/db.mjs —— 用 podman 管理 PostgreSQL 数据库容器
 *
 *   npm run db:start   启动（首次自动拉镜像建容器，数据持久化在命名卷 syl-pg-data）
 *   npm run db:stop    停止
 *   npm run db:status  查看状态
 *
 * 环境自适应：Windows 上优先用原生 podman；没有则走 WSL Debian 里的 podman。
 * 镜像优先 docker.io，失败自动换国内镜像（daocloud）。
 * 连接配置读 sis-config.json 的 db 段；容器只在宿主机侧暴露，局域网无法直连。
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const CFG = JSON.parse(readFileSync(new URL('../sis-config.json', import.meta.url), 'utf8')).db
  || { host: '127.0.0.1', port: 5432, user: 'syl', password: 'syl', database: 'syl' };
const NAME = 'syl-pg';
const IMAGES = ['docker.io/library/postgres:16-alpine', 'docker.m.daocloud.io/library/postgres:16-alpine'];

function sh(cmd, opts = {}){
  try{ return execSync(cmd, {encoding: 'utf8', ...opts}).toString().trim(); }
  catch(e){ if('ok' in opts) return ''; throw e; }
}
function say(cmd){ try{ execSync(cmd, {stdio: 'inherit'}); }catch(e){ /* 已在运行等情况忽略 */ } }

/* 选择 podman 运行方式 */
let POD = 'podman', IN_WSL = false;
if(process.platform === 'win32'){
  try{ execSync('podman --version', {stdio: 'ignore'}); }
  catch(e){
    const w = sh('wsl -d Debian -- podman --version', {ok: ''});
    if(!w.includes('podman version')) throw new Error('未找到可用的 podman（Windows 原生或 WSL Debian 均无）');
    POD = 'wsl -d Debian -- podman';
    IN_WSL = true;
  }
}
const pod = (args, opts = {}) => sh(`${POD} ${args}`, opts);
const podSay = args => say(`${POD} ${args}`);

const cmd = process.argv[2] || 'status';

if(cmd === 'start'){
  /* 原生 Windows podman 需要 machine；WSL 内原生运行不需要 */
  if(!IN_WSL && process.platform === 'win32'){
    const st = pod('machine inspect --format "{{.State}}"', {ok: ''});
    if(st !== 'running'){ console.log('启动 podman machine…'); podSay('machine start'); }
  }

  const exists = pod(`ps -a --filter name=${NAME} --format "{{.Names}}"`, {ok: ''});
  if(exists.includes(NAME)){
    console.log('启动已有容器…');
    podSay(`start ${NAME}`);
  }else{
    /* 依次尝试镜像源 */
    let okImg = null;
    for(const img of IMAGES){
      console.log('拉取镜像 ' + img + '（首次约 100MB）…');
      try{ podSay(`pull ${img}`); okImg = img; break; }
      catch(e){ console.log('拉取失败，换下一个源…'); }
    }
    if(!okImg){ console.error('❌ 所有镜像源均拉取失败，请检查网络'); process.exit(1); }
    /* WSL2 模式下必须绑 0.0.0.0 才能被 Windows localhost 转发；NAT 网络外部不可达 */
    const pub = IN_WSL ? `${CFG.port}:5432` : `127.0.0.1:${CFG.port}:5432`;
    say(`${POD} run -d --name ${NAME}` +
      ` -e POSTGRES_USER=${CFG.user} -e POSTGRES_PASSWORD=${CFG.password} -e POSTGRES_DB=${CFG.database}` +
      ` -p ${pub} -v syl-pg-data:/var/lib/postgresql/data ${okImg}`);
  }

  console.log('等待 PostgreSQL 就绪…');
  for(let i = 0; i < 40; i++){
    const ok = pod(`exec ${NAME} pg_isready -U ${CFG.user} -d ${CFG.database}`, {ok: ''});
    if(ok.includes('accepting connections')){
      console.log(`✅ PostgreSQL 已就绪：127.0.0.1:${CFG.port}（用户 ${CFG.user}，库 ${CFG.database}）`);
      process.exit(0);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.error('⚠️ 未在 40 秒内就绪，排查：' + POD + ' logs ' + NAME);
  process.exit(1);
}

if(cmd === 'stop'){
  podSay(`stop ${NAME}`);
  console.log('已停止（数据保留在卷 syl-pg-data）。');
  process.exit(0);
}

if(cmd === 'status'){
  const st = pod(`ps -a --filter name=${NAME} --format "{{.Status}}"`, {ok: ''});
  console.log('podman: ' + POD + (IN_WSL ? '（WSL Debian）' : ''));
  console.log(st ? `容器 ${NAME}: ${st}` : `容器 ${NAME} 尚未创建（npm run db:start）`);
  process.exit(0);
}

console.log('用法: node tools/db.mjs start|stop|status');
