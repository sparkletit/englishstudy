'use client';

/* 主页面：输入单词 → 元音标红展示 → 点击划分音节 → 音节/音标点读（华为云 SIS）→ 整词朗读（有道） */
import { useEffect, useRef, useState } from 'react';
import { analyze, markTypes } from '@/lib/engine';
import { playAudioUrl } from '@/lib/clientAudio';

/* ---- IPA → ARPAbet（SIS 合成与音节库文件名用） ---- */
const VOWEL_SET = new Set(['eɪ','aɪ','ɔɪ','əʊ','aʊ','ɪə','eə','ʊə','iː','uː','ɑː','ɔː','ɜː','æ','ɒ','ʌ','ə','ʊ','ɪ','e']);
const ARPA = {'b':'B','d':'D','f':'F','g':'G','h':'HH','j':'Y','k':'K','l':'L','m':'M','n':'N','p':'P','r':'R','s':'S','t':'T','v':'V','w':'W','z':'Z',
  'θ':'TH','ð':'DH','ʃ':'SH','ʒ':'ZH','tʃ':'CH','dʒ':'JH','ŋ':'NG',
  'æ':'AE','ɒ':'AA','ʌ':'AH','ə':'AH','ɜː':'ER','ɪ':'IH','e':'EH','ɑː':'AA','ɔː':'AO','ʊ':'UH','uː':'UW','iː':'IY',
  'eɪ':'EY','aɪ':'AY','ɔɪ':'OY','əʊ':'OW','aʊ':'AW'};
const ARPA_SPLIT = {'ɪə':['IH','R'], 'eə':['EH','R'], 'ʊə':['UH','R']};
function toArpabet(phonemes){
  const out = [];
  for(const p of phonemes){
    if(ARPA_SPLIT[p]){ out.push(ARPA_SPLIT[p][0] + '1', ARPA_SPLIT[p][1]); }
    else if(ARPA[p] !== undefined){
      out.push(VOWEL_SET.has(p) ? ARPA[p] + (p === 'ə' ? '0' : '1') : ARPA[p]);
    }
  }
  return out.join(' ');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- 字母着色：v(红) / silent(灰) / ''(黑) ---- */
function letterClasses(res, syl){
  const out = [];
  const s = syl.text, base = syl.wordStart || 0;
  if((syl.irrIpa !== null && syl.irrIpa !== undefined) || syl.suffix){
    [...s].forEach((ch, i) => {
      if('aeiou'.includes(ch)) out.push('v');
      else if(ch === 'y' && base + i > 0) out.push('v');
      else out.push('');
    });
    return out;
  }
  if(syl.isLE){
    for(let i = 0; i < s.length; i++) out.push(i >= s.length - 2 ? 'v' : '');
    return out;
  }
  const core = syl.coreText || s;
  for(let i = 0; i < core.length; i++){
    const abs = base + i;
    if(syl.vStart !== undefined && abs >= syl.vStart && abs <= syl.vEnd) out.push('v');
    else if(chIsSilentE(res, syl, i, abs)) out.push('silent');
    else out.push('');
  }
  for(let i = core.length; i < s.length; i++){
    out.push('aeiou'.includes(s[i]) ? 'v' : '');
  }
  return out;
}
function chIsSilentE(res, syl, i, abs){
  const s = syl.text;
  if(s[i] !== 'e' || i !== s.length - 1) return false;
  if(res.sylls[res.sylls.length-1] !== syl) return false;
  return !!res.magicShape;
}

export default function Home(){
  const [word, setWord] = useState('');
  const [current, setCurrent] = useState(null);     /* analyze() 结果 */
  const [divided, setDivided] = useState(false);
  const [playingIdx, setPlayingIdx] = useState(-1); /* 播放中的音节卡 */
  const [hotPh, setHotPh] = useState(null);         /* 播放中的音标 key */
  const [toastMsg, setToastMsg] = useState(null);
  const [sents, setSents] = useState(null);         /* 释义+例句（有道） */
  const [history, setHistory] = useState([]);       /* 最近查询词 */

  const onlineCache = useRef(new Map());            /* 音频 URL 缓存 */
  const playingToken = useRef(0);
  const inputRef = useRef(null);
  const toastTm = useRef(null);

  function toast(msg){
    setToastMsg(msg);
    clearTimeout(toastTm.current);
    toastTm.current = setTimeout(() => setToastMsg(null), 1800);
  }

  /* ---------- 播放（全部走华为云 SIS：本地库优先，缺失走 /api/tts 实时合成并落盘） ---------- */
  async function sisAudio(phonemes, text, file){
    file = file || '/syllables/' + toArpabet(phonemes).replace(/\s+/g, '_') + '.mp3';
    const ck = 'L|' + file;
    if(onlineCache.current.has(ck)) return onlineCache.current.get(ck);
    let ok = false;
    try{ const r = await fetch(file, {method: 'HEAD'}); ok = r.ok; }catch(e){ ok = false; }
    if(ok){ onlineCache.current.set(ck, file); return file; }
    try{
      const r = await fetch('/api/tts', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({arpa: toArpabet(phonemes), text: text || '', file: file.split('/').pop()})});
      if(r.ok){
        const url = URL.createObjectURL(await r.blob());
        onlineCache.current.set(ck, url);
        return url;
      }
    }catch(e){}
    return null;
  }

  async function playSyllable(i){
    const res = current;
    if(!res) return;
    setPlayingIdx(i);
    let played = false;
    const f = await sisAudio(res.sylls[i].ipa, res.sylls[i].text);
    if(f){ played = true; await playAudioUrl(f); }
    if(!played) toast('音节音频生成失败（SIS 服务不可用）');
    setPlayingIdx(-1);
  }
  async function playPhoneme(ph, key){
    setHotPh(key);
    try{
      const f = await sisAudio([ph], ph, '/syllables/PH_' + toArpabet([ph]) + '.mp3');
      if(f) await playAudioUrl(f);
      else toast('音素音频不可用（SIS 服务不可用）');
    }finally{ setHotPh(null); }
  }

  /* 整词朗读：有道在线（保留），失败回退系统 TTS */
  function playWordOnline(w){
    return new Promise((res, rej) => {
      const a = new Audio('https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=1');
      a.onended = res; a.onerror = rej;
      a.play().catch(rej);
    });
  }
  function speakTTS(w){
    if(!('speechSynthesis' in window)){ toast('当前浏览器不支持语音朗读'); return; }
    try{
      const u = new SpeechSynthesisUtterance(w);
      u.lang = 'en-GB'; u.rate = 0.8;
      const vs = speechSynthesis.getVoices();
      const v = vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
      if(v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }catch(e){ toast('朗读失败'); }
  }

  /* ---------- 最近查询（localStorage 持久化） ---------- */
  useEffect(() => {
    try{ setHistory(JSON.parse(localStorage.getItem('sylHistory') || '[]').filter(w => /^[a-z]+$/i.test(w)).slice(0, 5)); }catch(e){}
  }, []);
  function addHistory(w){
    setHistory(prev => {
      const next = [w, ...prev.filter(x => x !== w)].slice(0, 5);
      try{ localStorage.setItem('sylHistory', JSON.stringify(next)); }catch(e){}
      return next;    });
  }
  function clearHistory(){
    setHistory([]);
    try{ localStorage.removeItem('sylHistory'); }catch(e){}
  }

  /* ---------- 释义与例句（/api/sentences → 有道） ---------- */
  async function loadSents(w){
    setSents(null);
    try{
      const r = await fetch('/api/sentences?word=' + encodeURIComponent(w));
      if(!r.ok) return;
      const d = await r.json();
      if(d && (d.explains?.length || d.sentences?.length)) setSents(d);
    }catch(e){ /* 静默失败，仅不展示 */ }
  }

  /* ---------- 事件 ---------- */
  function showWord(w){
    const q = typeof w === 'string' ? w : word;   /* 词签点击直接传词，避免闭包过期 */
    const res = analyze(q);
    if(!res){ toast('请输入英文字母组成的单词'); return; }
    setCurrent(res); setDivided(false);
    loadSents(res.word);
    addHistory(res.word);
  }
  async function playAll(){
    if(!current || !divided) return;
    const my = ++playingToken.current;
    for(let i = 0; i < current.sylls.length; i++){
      if(my !== playingToken.current) return;
      await playSyllable(i);
      await sleep(220);
    }
  }
  function reset(){
    setCurrent(null); setDivided(false); setSents(null);
    setWord('');
    inputRef.current && inputRef.current.focus();
  }

  /* ---------- 渲染 ---------- */
  /* 未划分：整词展示（元音红、词尾 magic-e 灰） */
  function renderWhole(){
    const res = current;
    const T = markTypes(res.word);
    return (
      <>
        <div id="wordWhole" onClick={() => setDivided(true)}>
          {[...res.word].map((ch, i) => {
            let t = '';
            if(T[i] === 'v') t = 'v';
            else if(res.magicShape && i === res.word.length - 1) t = 'silent';
            else if(ch === 'g' || ch === 'h'){
              for(let j = Math.max(0, i-2); j <= i; j++) if(res.word.startsWith('igh', j) && i === j+2) t = 'v';
            }
            return <span key={i} className={t}>{ch}</span>;
          })}
        </div>
        <div className="hint">👆 点击单词，划分音节</div>
      </>
    );
  }
  /* 已划分：音节卡 + 音标点读 */
  function renderDivided(){
    const res = current;
    return (
      <>
        <div id="sylWrap">
          {res.sylls.map((syl, i) => (
            <span key={i} style={{display: 'contents'}}>
              {i > 0 && <div className="hyphen">-</div>}
              <div
                className={'syl' + (i === res.stress && res.sylls.length > 1 ? ' stress' : '') + (playingIdx === i ? ' playing' : '')}
                style={{animationDelay: (i*70) + 'ms'}}
                onClick={() => playSyllable(i)}
              >
                <div className="txt">
                  {letterClasses(res, syl).map((t, j) => (
                    <span key={j} className={t}>{syl.text[j]}</span>
                  ))}
                </div>
                <div className="ipa">
                  {i === res.stress && res.sylls.length > 1 && <span className="mark">ˈ</span>}
                  {syl.ipa.map((ph, j) => (
                    <span
                      key={j}
                      className={'ph' + (hotPh === i + ':' + j ? ' hot' : '')}
                      onClick={(e) => { e.stopPropagation(); playPhoneme(ph, i + ':' + j); }}
                    >{ph}</span>
                  ))}
                </div>
              </div>
            </span>
          ))}
        </div>
        <div className="meta">
          <b>{res.sylls.length}</b> 个音节 · 重音在第 <b>{res.stress+1}</b> 个音节<br/>{res.ipaText}
        </div>
        {res.boundaries && res.boundaries.length > 0 && (
          <div className="bndRules">
            {res.boundaries.map((r, i) => <span key={i}>{r}</span>)}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <header>
        <h1>📖 音节划分器</h1>
        <p>输入单词 · 元音标红 · 点击划分 · 点音标听发音</p>
      </header>

        <div className="search">
          <input
            ref={inputRef}
            type="text"
            placeholder="输入一个英语单词，如 student"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={word}
            onChange={e => setWord(e.target.value)}
            onKeyDown={e => { if(e.key === 'Enter') showWord(); }}
          />
          <button onClick={showWord}>显示</button>
        </div>
        {history.length > 0 && (
          <div className="samples hist">
            <span className="hlabel">🕘 最近</span>
            {history.map(w => (
              <button key={w} onClick={() => { setWord(w); showWord(w); }}>{w}</button>
            ))}
            <button className="hclear" onClick={clearHistory}>清空</button>
          </div>
        )}

        {current && (
          <div className="controls" style={{display: 'flex'}}>
            <button onClick={playAll}>🔊 逐音节播放</button>
            <button className="sec" onClick={() => { if(!current) return; playWordOnline(current.word).catch(() => speakTTS(current.word)); }}>🔊 整词朗读</button>
            <button className="sec" onClick={reset}>↺ 重新输入</button>
          </div>
        )}

        <div className="stage">
          {current ? (divided ? renderDivided() : renderWhole())
                   : <div className="hint">输入单词后按「显示」，再点击单词自动划分音节</div>}
        </div>

        {current && sents && (
          <div className="sents">
            {sents.explains.length > 0 && (
              <div className="defs">
                {sents.explains.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            {sents.sentences.map((s, i) => (
              <div className="sent" key={i}>
                <div className="en">
                  {s.parts.map((p, k) => p.hl ? <b key={k}>{p.t}</b> : <span key={k}>{p.t}</span>)}
                </div>
                <div className="zh">{s.zh}</div>
              </div>
            ))}
          </div>
        )}

        {current && sents && sents.videos?.length > 0 && (
          <div className="vids">
            <div className="vtitle">🎬 影视片段（点击播放，字幕跟读）</div>
            {sents.videos.map((v, i) => <VideoClip key={i} v={v} />)}
          </div>
        )}

        <details className="rules">
          <summary>划分口诀与规则（依据《音节划分与重音位置》）</summary>
          <div>
            1️⃣ <b>一个元音一音节</b>：先数元音（元音组合算一个），词尾不发音的 e 不算；<br/>
            2️⃣ <b>一靠后</b>：两元音间 1 个辅音，归后一音节，如 stu-dent、o-pen；<br/>
            3️⃣ <b>二分手</b>：两元音间 2 个辅音，一边一个，如 let-ter、win-ter；<br/>
            4️⃣ <b>组合不拆</b>：th、sh、ch、ck、tch、ph 及辅音连缀保持完整；<br/>
            5️⃣ <b>辅音 + le</b>：-ble / -tle / -ple 自成一个音节，如 ta-ble、lit-tle；<br/>
            6️⃣ <b>重音</b>：单音节词本身重读；双音节多重读在前；多音节一般重读倒数第三；-tion、-ic 等后缀按后缀规则。<br/>
            <span style={{color: '#94a3b8'}}>音标为英式 DJ 音标，按拼读规则生成，个别不规则词可能存在偏差。</span>
          </div>
        </details>

        <footer>元音 <span style={{color: 'var(--red)', fontWeight: 700}}>红色</span> · 灰色为不发音字母 · ˈ 重音符号<br/>
        点音节卡播放整个音节 · 点单个音标只听该音素<br/>
        音节/音素发音均为华为云 SIS 合成 · 整词朗读走有道在线发音</footer>

      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>
    </>
  );
}

/* ---------- 影视片段：播放器 + 播放进度同步高亮的字幕 ---------- */
function VideoClip({ v }){
  const ref = useRef(null);
  const [cur, setCur] = useState(-1);
  return (
    <div className="vclip">
      <video
        ref={ref}
        src={v.video}
        poster={v.cover}
        controls
        preload="metadata"
        playsInline
        onTimeUpdate={() => {
          const t = ref.current.currentTime;
          let idx = -1;
          v.cues.forEach((c, k) => { if(t >= c.start && t <= c.end) idx = k; });
          setCur(idx);
        }}
      />
      <div className="vsub">
        {v.cues.map((c, k) => (
          <div key={k} className={'cue' + (k === cur ? ' on' : '')}>
            {c.parts.map((p, m) => p.hl ? <b key={m}>{p.t}</b> : <span key={m}>{p.t}</span>)}
          </div>
        ))}
      </div>
      {v.contributor && <div className="vsrc">来源：{v.contributor}</div>}
    </div>
  );
}
