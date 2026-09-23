'use client';

/* 主页面：输入单词 → 元音标红展示 → 点击划分音节 → 音节/音标点读（SIS） */
import { useEffect, useRef, useState } from 'react';
import { analyze, markTypes } from '@/lib/engine';

const SAMPLES = ['student','banana','beautiful','computer','apple','little','teacher','elephant','station','water'];

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

/* ---- 引擎配置（localStorage） ---- */
function readCfg(name){
  try{ return JSON.parse(localStorage.getItem(name) || 'null'); }catch(e){ return null; }
}
function getEngineCfg(engine){
  if(engine === 'eleven'){
    const c = readCfg('sylEleven');
    return (c && c.key) ? Object.assign({voice:'JBFqnCBsd6RMkjVDRZzb'}, c) : null;
  }
  if(engine === 'azure'){
    const c = readCfg('sylAzure');
    return (c && c.key && c.region) ? c : null;
  }
  return null;
}
function getSelectedEngine(){
  const eng = localStorage.getItem('sylEngine') || 'lib';
  if(eng === 'lib' || eng === 'local') return 'lib';
  return getEngineCfg(eng) ? eng : 'lib';
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onlineCache = useRef(new Map());            /* 音频 URL 缓存 */
  const playingToken = useRef(0);
  const inputRef = useRef(null);
  const toastTm = useRef(null);

  function toast(msg){
    setToastMsg(msg);
    clearTimeout(toastTm.current);
    toastTm.current = setTimeout(() => setToastMsg(null), 1800);
  }

  /* ---------- 播放 ---------- */
  function playUrl(url){
    return new Promise(r2 => {
      const a = new Audio(url);
      a.onended = r2; a.onerror = r2;
      a.play().catch(r2);
    });
  }
  /* SIS 音节/音素音频：public/syllables 静态文件优先 → 缺失时 /api/tts 实时合成（服务端落盘缓存） */
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
  async function elevenSpeakIPA(ipa, sylText){
    const cfg = getEngineCfg('eleven');
    if(!cfg) return null;
    const clean = ipa.replace(/[ˈˌ.]/g, '');
    const ck = 'e|' + cfg.voice + '|' + clean;
    if(onlineCache.current.has(ck)) return onlineCache.current.get(ck);
    const ssml = '<speak><phoneme alphabet="ipa" ph="' + clean + '">' + (sylText || 'bee') + '</phoneme></speak>';
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + cfg.voice + '?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': cfg.key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text: ssml, model_id: 'eleven_flash_v2_5' })
    });
    if(!r.ok){ const t = await r.text(); throw new Error('ElevenLabs ' + r.status + ' ' + t.slice(0, 60)); }
    const ct = r.headers.get('content-type') || '';
    if(ct.includes('json')) throw new Error('ElevenLabs 返回错误');
    const buf = await r.arrayBuffer();
    const url = URL.createObjectURL(new Blob([buf], {type: 'audio/mpeg'}));
    onlineCache.current.set(ck, url);
    return url;
  }
  async function azureSpeakIPA(ipa, sylText){
    const cfg = getEngineCfg('azure');
    if(!cfg) return null;
    const clean = ipa.replace(/[ˈˌ.]/g, '');
    const ck = 'a|' + cfg.region + '|' + clean;
    if(onlineCache.current.has(ck)) return onlineCache.current.get(ck);
    const ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">' +
      '<voice name="en-GB-RyanNeural"><phoneme alphabet="ipa" ph="' + clean + '">' + (sylText || 'bee') + '</phoneme></voice></speak>';
    const r = await fetch('https://' + cfg.region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': cfg.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
      },
      body: ssml
    });
    if(!r.ok) throw new Error('Azure ' + r.status);
    const buf = await r.arrayBuffer();
    const url = URL.createObjectURL(new Blob([buf], {type: 'audio/mpeg'}));
    onlineCache.current.set(ck, url);
    return url;
  }

  async function playSyllable(i){
    const res = current;
    if(!res) return;
    setPlayingIdx(i);
    const eng = getSelectedEngine();
    let played = false;
    try{
      if(eng === 'lib'){
        const f = await sisAudio(res.sylls[i].ipa, res.sylls[i].text);
        if(f){ played = true; await playUrl(f); }
      } else {
        const url = eng === 'eleven' ? await elevenSpeakIPA(res.sylls[i].ipa.join(''), res.sylls[i].text)
                  : eng === 'azure'  ? await azureSpeakIPA(res.sylls[i].ipa.join(''), res.sylls[i].text)
                  : null;
        if(url){ played = true; await playUrl(url); }
      }
    }catch(e){ toast('在线合成失败(' + String(e.message || e).slice(0, 60) + ')'); }
    if(!played) toast('音节音频生成失败（SIS 服务不可用）');
    setPlayingIdx(-1);
  }
  async function playPhoneme(ph, key){
    setHotPh(key);
    try{
      const f = await sisAudio([ph], ph, '/syllables/PH_' + toArpabet([ph]) + '.mp3');
      if(f) await playUrl(f);
      else toast('音素音频不可用（SIS 服务不可用）');
    }finally{ setHotPh(null); }
  }

  /* 整词朗读：有道在线，失败回退系统 TTS */
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

  /* ---------- 事件 ---------- */
  function showWord(){
    const res = analyze(word);
    if(!res){ toast('请输入英文字母组成的单词'); return; }
    setCurrent(res); setDivided(false);
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
    setCurrent(null); setDivided(false);
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
      <div className="app">
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
        <div className="samples">
          {SAMPLES.map(w => (
            <button key={w} onClick={() => { setWord(w); setTimeout(showWord, 0); }}>{w}</button>
          ))}
        </div>

        <div className="stage">
          {current ? (divided ? renderDivided() : renderWhole())
                   : <div className="hint">输入单词后按「显示」，再点击单词自动划分音节</div>}
        </div>

        {current && (
          <div className="controls" style={{display: 'flex'}}>
            <button onClick={playAll}>🔊 逐音节播放</button>
            <button className="sec" onClick={() => { if(!current) return; playWordOnline(current.word).catch(() => speakTTS(current.word)); }}>🔊 整词朗读</button>
            <button className="sec" onClick={() => setSettingsOpen(true)}>⚙ 语音设置</button>
            <button className="sec" onClick={reset}>↺ 重新输入</button>
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
      </div>

      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} toast={toast} />}
    </>
  );
}

/* ---------- 语音设置弹窗 ---------- */
function SettingsModal({ onClose, toast }){
  const [eng, setEng] = useState('lib');
  const [elKey, setElKey] = useState('');
  const [elVoice, setElVoice] = useState('JBFqnCBsd6RMkjVDRZzb');
  const [azRegion, setAzRegion] = useState('');
  const [azKey, setAzKey] = useState('');

  useEffect(() => {
    setEng(getSelectedEngine());
    const ec = readCfg('sylEleven') || {}, ac = readCfg('sylAzure') || {};
    setElKey(ec.key || '');
    setElVoice(ec.voice || 'JBFqnCBsd6RMkjVDRZzb');
    setAzRegion(ac.region || '');
    setAzKey(ac.key || '');
  }, []);

  function save(){
    if(eng === 'eleven'){
      if(!elKey.trim()){ toast('请填写 API Key'); return; }
      localStorage.setItem('sylEleven', JSON.stringify({key: elKey.trim(), voice: elVoice}));
    } else if(eng === 'azure'){
      if(!azRegion.trim() || !azKey.trim()){ toast('请填写区域和密钥'); return; }
      localStorage.setItem('sylAzure', JSON.stringify({region: azRegion.trim(), key: azKey.trim()}));
    }
    localStorage.setItem('sylEngine', eng);
    onClose();
    toast('已启用' + ({eleven: 'ElevenLabs', lib: 'SIS 音节库（本地+在线补齐）', azure: 'Azure'}[eng] || eng) + '音节合成');
  }

  return (
    <div className="modal" style={{display: 'flex'}} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>⚙ 语音设置</h3>
        <label className="opt">
          <input type="radio" name="ttsengine" value="eleven" checked={eng === 'eleven'} onChange={() => setEng('eleven')}/>
          {' '}ElevenLabs 音标合成（邮箱注册免卡，浏览器直连）
        </label>
        {eng === 'eleven' && (
          <div>
            <input type="text" placeholder="API Key（个人资料页复制）" autoComplete="off" value={elKey} onChange={e => setElKey(e.target.value)}/>
            <select
              style={{width: '100%', fontSize: 15, padding: '9px 12px', margin: '6px 0', border: '2px solid var(--line)', borderRadius: 10, boxSizing: 'border-box'}}
              value={elVoice} onChange={e => setElVoice(e.target.value)}
            >
              <option value="pNInz6obpgDQGcFmaJgB">Adam（美音·男）</option>
              <option value="21m00Tcm4TlvDq8ikWAM">Rachel（美音·女）</option>
              <option value="JBFqnCBsd6RMkjVDRZzb">George（英音·男）</option>
              <option value="XB0fDUnXU5powFXDhCwa">Charlotte（英音·女）</option>
            </select>
            <p className="tip">注册：elevenlabs.io 邮箱注册（免费，无需信用卡）→ 右上角头像 → Profile + API key → 复制 Key。支持 IPA 音标合成。注意免费层每月约 1 万字符且 SSML 标记计入（约 150 个新音节/月，本应用会缓存）；付费 $5/月起近乎不限。</p>
          </div>
        )}
        <label className="opt">
          <input type="radio" name="ttsengine" value="lib" checked={eng === 'lib'} onChange={() => setEng('lib')}/>
          {' '}本地音节库（public/syllables/，SIS 标准发音，已生成 352 个音节 + 44 个音素）
        </label>
        {eng === 'lib' && (
          <div>
            <p className="tip">
              已用华为云 SIS 为词表内 352 个音节批量生成标准读音（音色：Alvin 英文男声，音量 80），保存在 public/syllables/，点音节直接播本地文件。
              遇到库里没有的音节（如生词），会自动通过本应用的 <b>/api/tts</b> 接口实时调 SIS 合成并缓存，之后同样秒播。
              要批量补充新词，运行 <b>npm run gen -- --ak AK --sk SK --pid 项目ID</b>（详见 tools/gen-syllables.js 顶部注释）。
              密钥配置在 <b>sis-config.json</b>（服务端文件，不会下发到浏览器）。
            </p>
          </div>
        )}
        <label className="opt">
          <input type="radio" name="ttsengine" value="azure" checked={eng === 'azure'} onChange={() => setEng('azure')}/>
          {' '}Azure 智能语音（按音标合成，音质最好，需信用卡注册）
        </label>
        {eng === 'azure' && (
          <div>
            <input type="text" placeholder="区域 Region，如 eastasia" value={azRegion} onChange={e => setAzRegion(e.target.value)}/>
            <input type="text" placeholder="语音服务密钥 Key" value={azKey} onChange={e => setAzKey(e.target.value)}/>
            <p className="tip">在 azure.microsoft.com 免费注册「语音服务」(F0 免费层每月 50 万字符)，创建资源时选择区域（如 eastasia / southeastasia / eastus），在「密钥和终结点」页复制 Key。</p>
          </div>
        )}
        <div className="modal-btns">
          <button className="sec" onClick={onClose}>取消</button>
          <button className="pri" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}
