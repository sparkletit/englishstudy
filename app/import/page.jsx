'use client';

/* 批量导入与单元管理：入库、展开编辑（追加/删除单词、重命名）、删除单元 */
import { useEffect, useState } from 'react';

export default function ImportPage(){
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [units, setUnits] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [openWords, setOpenWords] = useState([]);
  const [addText, setAddText] = useState('');

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
    if(openId === u.id) setOpenId(null);
    load();
  }

  async function toggleOpen(u){
    if(openId === u.id){ setOpenId(null); return; }
    setOpenId(u.id);
    setAddText('');
    await refreshWords(u.id);
  }
  async function refreshWords(uid){
    setOpenWords([]);
    const j = await fetch('/api/units/' + uid).then(r => r.json()).catch(() => null);
    if(j && j.words) setOpenWords(j.words);
  }

  async function addWordsTo(uid){
    const t = addText.trim();
    if(!t) return;
    const r = await fetch(`/api/units/${uid}/words`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text: t})
    });
    const j = await r.json().catch(() => ({}));
    if(r.ok){
      flash(`✅ 追加 ${j.added} 个单词` + (j.added === 0 ? '（都已存在）' : ''), true);
      setAddText('');
      refreshWords(uid);
      load();
    }else{
      flash('❌ ' + (j.error || '添加失败'), false);
    }
  }

  async function removeWord(uid, w){
    const r = await fetch(`/api/units/${uid}/words?word=${encodeURIComponent(w)}`, {method: 'DELETE'});
    if(r.ok){
      setOpenWords(prev => prev.filter(x => x !== w));
      load();
    }else{
      flash('❌ 删除失败', false);
    }
  }

  async function rename(u){
    const newName = window.prompt('新的单元名称：', u.name);
    if(!newName || !newName.trim() || newName.trim() === u.name) return;
    const r = await fetch('/api/units/' + u.id, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: newName.trim()})
    });
    const j = await r.json().catch(() => ({}));
    if(r.ok){ flash('✅ 已重命名', true); load(); }
    else flash('❌ ' + (j.error || '重命名失败'), false);
  }

  return (
    <>
      <header>
        <h1>📥 批量导入</h1>
        <p>粘贴一批单词 → 命名单元 → 入库；点单元名展开编辑</p>
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
              <button className="udel" onClick={() => rename(u)}>重命名</button>
              <button className="udel" onClick={() => del(u)}>删除</button>
            </div>
            {openId === u.id && (
              <div className="unitedit">
                <div className="wordchips">
                  {openWords.length === 0 && <span className="phint">加载中…</span>}
                  {openWords.map(w => (
                    <span key={w} className="wchip">
                      {w}
                      <button className="wx" title="删除这个词" onClick={() => removeWord(u.id, w)}>✕</button>
                    </span>
                  ))}
                </div>
                <div className="addrow">
                  <input
                    type="text" className="ainput" placeholder="追加单词（可多个，空格分隔）"
                    autoComplete="off" autoCapitalize="off" spellCheck={false}
                    value={addText}
                    onChange={e => setAddText(e.target.value)}
                    onKeyDown={e => { if(e.key === 'Enter') addWordsTo(u.id); }}
                  />
                  <button className="sec2" onClick={() => addWordsTo(u.id)}>添加</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {msg && <div className={'toast show ' + (msg.ok ? 'tok' : 'terr')}>{msg.m}</div>}
    </>
  );
}
