'use client';

/* 拼写练习：选单元 → 随机抽 30% 单词 → 遮住约一半字母，凭残缺拼写 + 听音提示 */
import { useEffect, useState } from 'react';
import { speakWordSafe, shuffle } from '@/lib/clientAudio';

/* 生成遮罩：遮住约一半字母，至少留 1 个、至少遮 1 个 */
function maskOf(word){
  const n = word.length;
  const mask = new Array(n).fill(false);
  const maskCount = n <= 2 ? 1 : Math.max(1, Math.round(n * 0.5));
  shuffle([...Array(n).keys()]).slice(0, maskCount).forEach(i => mask[i] = true);
  if(mask.every(m => m)) mask[Math.floor(Math.random() * n)] = false;
  return mask;
}

export default function SpellPage(){
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [items, setItems] = useState(null);      /* [{word, mask, input, status, revealed}] */
  const [unitName, setUnitName] = useState('');

  useEffect(() => {
    fetch('/api/units').then(r => r.json()).then(d => Array.isArray(d) ? setUnits(d) : setUnits([])).catch(() => setUnits([]));
  }, []);

  async function draw(){
    if(!unitId) return;
    const j = await fetch('/api/units/' + unitId).then(r => r.json()).catch(() => null);
    if(!j || !j.words) return;
    const m = Math.max(1, Math.ceil(j.words.length * 0.3));
    setUnitName(j.name);
    setItems(shuffle(j.words).slice(0, m).map(w => ({
      word: w, mask: maskOf(w), input: '', status: '', revealed: false
    })));
  }

  function check(i){
    setItems(prev => prev.map((it, k) => {
      if(k !== i) return it;
      if(it.input.trim().toLowerCase() === it.word){
        return {...it, status: 'ok', revealed: true};
      }
      return {...it, status: 'no'};
    }));
  }

  function reveal(i){
    setItems(prev => prev.map((it, k) => k === i ? {...it, revealed: true, status: it.status || 'revealed'} : it));
  }

  function setVal(i, v){
    setItems(prev => prev.map((it, k) => k === i ? {...it, input: v, status: ''} : it));
  }

  const done = items ? items.filter(it => it.status === 'ok').length : 0;
  const answered = items ? items.filter(it => it.status !== '' || it.revealed).length : 0;

  return (
    <>
      <header>
        <h1>✏️ 拼写练习</h1>
        <p>选单元 → 随机抽 30% 单词 → 看残缺拼写，可听发音提示</p>
      </header>

      <div className="panel">
        <div className="panel-row">
          <select className="tsel" value={unitId} onChange={e => { setUnitId(e.target.value); setItems(null); }}>
            <option value="">— 选择单元 —</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}（{u.count} 词）</option>)}
          </select>
          <button className="pri" disabled={!unitId} onClick={draw}>{items ? '🔄 换一批' : '抽取 30%'}</button>
        </div>
        {units.length === 0 && <div className="phint">还没有单元，先去「📥 导入」添加</div>}
      </div>

      {items && (
        <div className="panel">
          <div className="ptitle">
            「{unitName}」拼对 <b className="okc">{done}</b> / {items.length}（已作答 {answered}）
          </div>
          {items.map((it, i) => (
            <div key={i} className={'srow ' + it.status}>
              <div className="srow-top">
                <div className="masked">
                  {[...it.word].map((ch, k) => (
                    <span key={k} className={(it.revealed || !it.mask[k]) ? 'vis' : 'hid'}>
                      {(it.revealed || !it.mask[k]) ? ch : '_'}
                    </span>
                  ))}
                </div>
                <button className="sec2" onClick={() => speakWordSafe(it.word)}>🔊 提示</button>
              </div>
              <div className="srow-in">
                <input
                  type="text" className="sinput" placeholder="输入完整单词"
                  autoComplete="off" autoCapitalize="off" spellCheck={false}
                  value={it.input}
                  disabled={it.status === 'ok'}
                  onChange={e => setVal(i, e.target.value)}
                  onKeyDown={e => { if(e.key === 'Enter') check(i); }}
                />
                {it.status === 'ok'
                  ? <span className="okmark">✓ 正确</span>
                  : <button className="sec2" onClick={() => check(i)}>检查</button>}
                {!it.revealed && it.status !== 'ok'
                  && <button className="sec2 ghost" onClick={() => reveal(i)}>答案</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
