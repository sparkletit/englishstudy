'use client';

/* 批量导入：定义单元名 → 批量粘贴单词入库（PostgreSQL）；下方管理已有单元 */
import { useEffect, useState } from 'react';

export default function ImportPage(){
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [units, setUnits] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [openWords, setOpenWords] = useState([]);

  function load(){
    fetch('/api/units').then(r => r.json()).then(d => Array.isArray(d) ? setUnits(d) : setUnits([])).catch(() => setUnits([]));
  }
  useEffect(load, []);

  function flash(m, ok){
    setMsg({m, ok});
    setTimeout(() => setMsg(null), 2600);
  }

  async function submit(){
    if(busy) return;
    setBusy(true);
    try{
      const r = await fetch('/api/units', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, text})
      });
      const j = await r.json().catch(() => ({}));
      if(r.ok){
        flash(`✅ 单元「${j.name}」已入库 ${j.added} 个单词`, true);
        setName(''); setText('');
        load();
      }else{
        flash('❌ ' + (j.error || '保存失败'), false);
      }
    }catch(e){
      flash('❌ 网络错误：' + String(e.message || e).slice(0, 60), false);
    }
    setBusy(false);
  }

  async function del(u){
    if(!window.confirm(`删除单元「${u.name}」（${u.count} 个单词）？不可恢复。`)) return;
    await fetch('/api/units/' + u.id, {method: 'DELETE'});
    load();
  }

  async function toggleOpen(u){
    if(openId === u.id){ setOpenId(null); return; }
    setOpenId(u.id);
    setOpenWords([]);
    const j = await fetch('/api/units/' + u.id).then(r => r.json()).catch(() => null);
    if(j && j.words) setOpenWords(j.words);
  }

  return (
    <>
      <header>
        <h1>📥 批量导入</h1>
        <p>粘贴一批单词 → 命名单元 → 入库，供听写/拼写练习使用</p>
      </header>

      <div className="panel">
        <div className="panel-row">
          <input
            type="text" className="tinput" placeholder="单元名称，如：七年级上 Unit 1"
            value={name} maxLength={40}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <textarea
          className="tarea" rows={7}
          placeholder={'粘贴单词，空格/逗号/换行分隔均可，例如：\napple banana orange\nstudent teacher doctor'}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="panel-row">
          <span className="phint">
            {text.trim() ? '识别到 ' + new Set(text.toLowerCase().split(/[^a-z]+/).filter(Boolean)).size + ' 个单词' : '仅支持英文字母单词'}
          </span>
          <button className="pri" disabled={busy || !name.trim() || !text.trim()} onClick={submit}>
            {busy ? '保存中…' : '入库'}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">我的单元（{units.length}）</div>
        {units.length === 0 && <div className="phint">还没有单元，先在上方导入一批单词</div>}
        {units.map(u => (
          <div key={u.id}>
            <div className="unitrow">
              <button className="unitname" onClick={() => toggleOpen(u)}>
                📁 {u.name}
                <span className="ucount">{u.count} 词</span>
              </button>
              <button className="udel" onClick={() => del(u)}>删除</button>
            </div>
            {openId === u.id && (
              <div className="unitwords">
                {openWords.length ? openWords.join(' · ') : '加载中…'}
              </div>
            )}
          </div>
        ))}
      </div>

      {msg && <div className={'toast show ' + (msg.ok ? 'tok' : 'terr')}>{msg.m}</div>}
    </>
  );
}
