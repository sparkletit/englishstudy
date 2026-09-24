/* 客户端共享音频工具
   关键设计：全站复用一个 Audio 元素 + 串行播放队列。
   微信/iOS 内置浏览器限制：每次新建 Audio 播放需在手势内，队列/定时器触发的后续播放会被静默拦截；
   复用同一元素并在首次手势中解锁后，换 src 继续播放不再受限。 */
let sharedAudio = null;
let playing = false;
const queue = [];

function getAudio(){
  if(sharedAudio === null && typeof Audio !== 'undefined'){
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

/* 供手势期主动预热解锁（可选调用） */
export function unlockAudio(){
  const a = getAudio();
  if(a){
    a.muted = true;
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
  }
}

function pump(){
  if(playing || queue.length === 0) return;
  const job = queue.shift();
  const a = getAudio();
  if(!a){ job.resolve(); return; }
  playing = true;
  let finished = false;
  const finish = () => {
    if(finished) return;
    finished = true;
    a.onended = a.onerror = null;
    playing = false;
    job.resolve();
    pump();
  };
  a.src = job.url;
  a.onended = finish;
  a.onerror = () => { job.onError && job.onError(); finish(); };
  const p = a.play();
  if(p && p.catch) p.catch(() => { job.onError && job.onError(); finish(); });
}

/* 播放一个音频 URL，完成后 resolve；失败时调用 onError（用于回退） */
export function playAudioUrl(url, onError){
  return new Promise(resolve => {
    queue.push({url, resolve, onError});
    pump();
  });
}

/* 整词朗读：有道在线，失败回退系统 TTS */
function youdaoUrl(w){
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=1';
}
export function speakWordSafe(w){
  return playAudioUrl(youdaoUrl(w), () => {
    try{
      if('speechSynthesis' in window){
        const u = new SpeechSynthesisUtterance(w);
        u.lang = 'en-GB'; u.rate = 0.8;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      }
    }catch(e){}
  });
}

export function shuffle(arr){
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
