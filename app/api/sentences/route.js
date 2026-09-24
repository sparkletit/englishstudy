/* GET /api/sentences?word=beautiful —— 单词释义 + 双语例句（服务端转发有道词典，规避 CORS）
   返回 {word, explains:[...], sentences:[{parts:[{t,hl}], zh}]}
   parts 中 hl:true 的片段为目标词（页面标红显示）；服务端内存缓存，重复查询不再次请求 */
const cache = new Map();

export async function GET(req){
  const { searchParams } = new URL(req.url);
  const word = (searchParams.get('word') || '').toLowerCase().trim();
  if(!/^[a-z]+$/.test(word)) return Response.json({error: 'bad word'}, {status: 400});
  if(cache.has(word)) return Response.json(cache.get(word));

  try{
    const r = await fetch('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if(!r.ok) throw new Error('youdao ' + r.status);
    const j = await r.json();

    /* 中文释义：ec.word[].trs[].tr[].l.i → 按「；」拆成多行 */
    const explains = [];
    ((j.ec && j.ec.word) || []).slice(0, 2).forEach(w => (w.trs || []).forEach(tr => {
      const i = tr && tr.tr && tr.tr[0] && tr.tr[0].l && tr.tr[0].l.i;
      if(Array.isArray(i)){
        const s = i.filter(x => typeof x === 'string').join('').trim();
        if(s) s.split(/；|;/).slice(0, 4).forEach(x => { if(x.trim()) explains.push(x.trim()); });
      }
    }));

    /* 双语例句：blng_sents_part['sentence-pair']，<b> 标记即目标词 */
    const sentences = [];
    const pairs = (j.blng_sents_part && j.blng_sents_part['sentence-pair']) || [];
    for(const p of pairs){
      if(sentences.length >= 3) break;
      const rawEn = String(p['sentence-eng'] || '');
      const zh = String(p['sentence-translation'] || '').replace(/<[^>]+>/g, '').trim();
      const parts = [];
      const re = /<b>(.*?)<\/b>/g;
      let last = 0, m;
      while((m = re.exec(rawEn))){
        if(m.index > last) parts.push({t: rawEn.slice(last, m.index).replace(/<[^>]+>/g, '')});
        parts.push({t: m[1], hl: true});
        last = re.lastIndex;
      }
      if(last < rawEn.length) parts.push({t: rawEn.slice(last).replace(/<[^>]+>/g, '')});
      const en = parts.map(x => x.t).join('').replace(/\s+/g, ' ').trim();
      if(en && zh && en.length < 120) sentences.push({parts, zh});
    }

    const data = {word, explains, sentences};
    cache.set(word, data);
    return Response.json(data);
  }catch(e){
    return Response.json({error: String(e.message || e).slice(0, 120)}, {status: 502});
  }
}
