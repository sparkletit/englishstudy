#!/usr/bin/env node
/* 一次性：给两个环境的所有单元名加前缀（已带前缀的跳过） */
const PREFIX = '七年级（上）-';
const urls = ['http://127.0.0.1:8123', 'https://e.elpf.tech'];

for(const url of urls){
  console.log('=== ' + url + ' ===');
  const units = await fetch(url + '/api/units').then(r => r.json()).catch(() => []);
  if(!Array.isArray(units)){ console.log('  获取失败'); continue; }
  for(const u of units){
    if(u.name.startsWith(PREFIX)){ console.log('  = ' + u.name + '（已有前缀）'); continue; }
    const r = await fetch(url + '/api/units/' + u.id, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: PREFIX + u.name})
    });
    console.log((r.ok ? '  ✓ ' : '  ✗ ') + u.name + ' → ' + PREFIX + u.name);
  }
}
