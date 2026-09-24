/* 客户端共享：整词朗读（有道在线，失败回退系统 TTS） */
export function playWordOnline(w){
  return new Promise((res, rej) => {
    const a = new Audio('https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=1');
    a.onended = res; a.onerror = rej;
    a.play().catch(rej);
  });
}
export function speakWordSafe(w){
  return playWordOnline(w).catch(() => {
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
