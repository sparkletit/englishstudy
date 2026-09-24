'use client';

/* 听写（报词）：选单元 → 随机抽 50% 单词 → 点卡报发音；支持顺序连续报词 */
import { useEffect, useRef, useState } from 'react';
import { speakWordSafe, shuffle } from '@/lib/clientAudio';

export default function ListenPage(){
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [picked, setPicked] = useState(null);   /* {name, total, words} */
  const [playingIdx, setPlayingIdx] = useState(-1);
  const [auto, setAuto] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    fetch('/api/units').then(r => r.json()).then(d => Array.isArray(d) ? setUnits(d) : setUnits([])).catch(() => setUnits([]));
  }, []);

  async function draw(){
    stopAuto();
    if(!unitId) return;
    const j = await fetch('/api/units/' + unitId).then(r => r.json()).catch(() => null);
    if(!j || !j.words) return;
    const m = Math.max(1, Math.ceil(j.words.length * 0.5));
    setPicked({name: j.name, total: j.words.length, words: shuffle(j.words).slice(0, m)});
  }

  async function playOne(w, i){
    setPlayingIdx(i);
    await speakWordSafe(w);
    setPlayingIdx(-1);
  }

  function stopAuto(){
    token.current++;
    setAuto(false);
    setPlayingIdx(-1);
  }

  async function playAuto(){
    if(!picked || auto) return;
    const my = ++token.current;
    setAuto(true);
    for(let i = 0; i < picked.words.length; i++){
      if(my !== token.current) return;
      await playOne(picked.words[i], i);
      if(my !== token.current) return;
      await new Promise(r => setTimeout(r, 4000));   /* 报词间隔，留时间书写 */
    }
    if(my === token.current) setAuto(false);
  }

  return (
    <>
      <header>
        <h1>🎧 听写报词</h1>
        <p>选单元 → 随机抽 50% 单词 → 点击卡片报发音</p>
      </header>

      <div className="panel">
        <div className="panel-row">
          <select className="tsel" value={unitId} onChange={e => { setUnitId(e.target.value); setPicked(null); }}>
            <option value="">— 选择单元 —</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}（{u.count} 词）</option>)}
          </select>
          <button className="pri" disabled={!unitId} onClick={draw}>{picked ? '🔄 换一批' : '抽取 50%'}</button>
        </div>
        {units.length === 0 && <div className="phint">还没有单元，先去「📥 导入」添加</div>}
      </div>

      {picked && (
        <>
          <div className="panel">
            <div className="ptitle">
              「{picked.name}」共 {picked.total} 词 · 本次抽取 {picked.words.length} 个
            </div>
            <div className="wordgrid">
              {picked.words.map((w, i) => (
                <button
                  key={i}
                  className={'wcard' + (playingIdx === i ? ' playing' : '')}
                  onClick={() => playOne(w, i)}
                >{w}</button>
              ))}
            </div>
            <div className="panel-row" style={{marginTop: 12}}>
              <button className="pri" onClick={playAuto} disabled={auto}>▶️ 顺序报词（每词隔 4 秒）</button>
              {auto && <button className="sec2" onClick={stopAuto}>⏹ 停止</button>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
