/* 音节划分 + DJ音标生成引擎（从 index.html ENGINE 块原样迁移，纯函数无 DOM 依赖） */
const VOWELS = 'aeiou';

/* 音素表（DJ 英式 48 音素；assets/syllables/PH_*.mp3 为其 SIS 发音） */
const PHONEMES = ['eɪ','aɪ','ɔɪ','əʊ','aʊ','ɪə','eə','ʊə','iː','uː','ɑː','ɔː','ɜː',
  'tʃ','dʒ','ts','dz','tr','dr','θ','ð','ʃ','ʒ','ŋ',
  'æ','ɒ','ʌ','ə','ʊ','ɪ','e','b','d','f','g','h','j','k','l','m','n','p','r','s','t','v','w','z'];

function parseIPA(str){
  const out = []; let i = 0;
  outer: while(i < str.length){
    const ch = str[i];
    if(ch === 'ˈ' || ch === 'ˌ' || ch === '.' || ch === ' ' || ch === '-'){ i++; continue; }
    for(const p of PHONEMES){
      if(str.startsWith(p, i)){ out.push(p); i += p.length; continue outer; }
    }
    i++;
  }
  return out;
}

/* ============ 高频不规则词：[划分, 每音节音标, 重音下标] ============ */
const IRREGULAR = {
  a:[['a'],['ə'],0], the:[['the'],['ðə'],0],
  have:[['have'],['hæv'],0], give:[['give'],['gɪv'],0], live:[['live'],['lɪv'],0], love:[['love'],['lʌv'],0],
  come:[['come'],['kʌm'],0], some:[['some'],['sʌm'],0], done:[['done'],['dʌn'],0], gone:[['gone'],['gɒn'],0],
  one:[['one'],['wʌn'],0], once:[['once'],['wʌns'],0], son:[['son'],['sʌn'],0],
  two:[['two'],['tuː'],0], who:[['who'],['huː'],0], whom:[['whom'],['huːm'],0], whose:[['whose'],['huːz'],0],
  does:[['does'],['dʌz'],0], do:[['do'],['duː'],0], to:[['to'],['tuː'],0],
  move:[['move'],['muːv'],0], prove:[['prove'],['pruːv'],0], lose:[['lose'],['luːz'],0], shoe:[['shoe'],['ʃuː'],0], shoes:[['shoes'],['ʃuːz'],0],
  mother:[['moth','er'],['mʌ','ðə'],0], father:[['fa','ther'],['fɑː','ðə'],0], brother:[['bro','ther'],['brʌ','ðə'],0],
  weather:[['weath','er'],['we','ðə'],0], whether:[['wheth','er'],['we','ðə'],0],
  together:[['to','geth','er'],['tə','ge','ðə'],1], other:[['oth','er'],['ʌ','ðə'],0],
  another:[['a','noth','er'],['ə','nʌ','ðə'],1], either:[['ei','ther'],['aɪ','ðə'],0], neither:[['nei','ther'],['naɪ','ðə'],0],
  they:[['they'],['ðeɪ'],0], them:[['them'],['ðem'],0], then:[['then'],['ðen'],0], than:[['than'],['ðæn'],0],
  this:[['this'],['ðɪs'],0], that:[['that'],['ðæt'],0], these:[['these'],['ðiːz'],0], those:[['those'],['ðəʊz'],0],
  there:[['there'],['ðeə'],0], their:[['their'],['ðeə'],0], though:[['though'],['ðəʊ'],0],
  with:[['with'],['wɪð'],0], without:[['with','out'],['wɪð','aʊt'],0], thus:[['thus'],['ðʌs'],0], his:[['his'],['hɪz'],0],
  breathe:[['breathe'],['briːð'],0], breath:[['breath'],['breθ'],0], clothes:[['clothes'],['kləʊðz'],0], smooth:[['smooth'],['smuːð'],0],
  said:[['said'],['sed'],0], says:[['says'],['sez'],0],
  again:[['a','gain'],['ə','gen'],1], against:[['a','gainst'],['ə','genst'],1],
  bread:[['bread'],['bred'],0], head:[['head'],['hed'],0], dead:[['dead'],['ded'],0],
  ready:[['read','y'],['red','i'],0], already:[['al','read','y'],['ɔːl','red','i'],0],
  great:[['great'],['greɪt'],0], break:[['break'],['breɪk'],0], steak:[['steak'],['steɪk'],0],
  breakfast:[['break','fast'],['brek','fəst'],0], sweat:[['sweat'],['swet'],0], sweater:[['sweat','er'],['swet','ə'],0],
  heavy:[['heav','y'],['hev','i'],0],
  learn:[['learn'],['lɜːn'],0], early:[['ear','ly'],['ɜː','li'],0], earth:[['earth'],['ɜːθ'],0], search:[['search'],['sɜːtʃ'],0],
  heart:[['heart'],['hɑːt'],0],
  hear:[['hear'],['hɪə'],0], near:[['near'],['nɪə'],0], dear:[['dear'],['dɪə'],0], year:[['year'],['jɪə'],0],
  ear:[['ear'],['ɪə'],0], clear:[['clear'],['klɪə'],0], here:[['here'],['hɪə'],0],
  bear:[['bear'],['beə'],0], pear:[['pear'],['peə'],0], wear:[['wear'],['weə'],0], where:[['where'],['weə'],0],
  friend:[['friend'],['frend'],0], friendly:[['friend','ly'],['frend','li'],0],
  people:[['peo','ple'],['piː','pl'],0],
  because:[['be','cause'],['bɪ','kɒz'],1], water:[['wa','ter'],['wɔː','tə'],0],
  want:[['want'],['wɒnt'],0], was:[['was'],['wɒz'],0], wash:[['wash'],['wɒʃ'],0], watch:[['watch'],['wɒtʃ'],0],
  what:[['what'],['wɒt'],0], war:[['war'],['wɔː'],0], warm:[['warm'],['wɔːm'],0],
  word:[['word'],['wɜːd'],0], work:[['work'],['wɜːk'],0], world:[['world'],['wɜːld'],0], worth:[['worth'],['wɜːθ'],0],
  worry:[['wor','ry'],['wʌ','ri'],0], wonder:[['won','der'],['wʌn','də'],0],
  could:[['could'],['kʊd'],0], would:[['would'],['wʊd'],0], should:[['should'],['ʃʊd'],0],
  you:[['you'],['juː'],0], young:[['young'],['jʌŋ'],0], touch:[['touch'],['tʌtʃ'],0],
  enough:[['e','nough'],['ɪ','nʌf'],1], tough:[['tough'],['tʌf'],0], rough:[['rough'],['rʌf'],0], laugh:[['laugh'],['lɑːf'],0],
  eight:[['eight'],['eɪt'],0], height:[['height'],['haɪt'],0], weight:[['weight'],['weɪt'],0],
  neighbour:[['neigh','bour'],['neɪ','bə'],0], colour:[['col','our'],['kʌ','lə'],0], blood:[['blood'],['blʌd'],0],
  put:[['put'],['pʊt'],0], pull:[['pull'],['pʊl'],0], push:[['push'],['pʊʃ'],0], full:[['full'],['fʊl'],0],
  every:[['ev','ery'],['ev','ri'],0], evening:[['eve','ning'],['iːv','nɪŋ'],0],
  seven:[['sev','en'],['sev','ən'],0], never:[['nev','er'],['nev','ə'],0], ever:[['ev','er'],['ev','ə'],0],
  river:[['riv','er'],['rɪv','ə'],0], second:[['se','cond'],['se','kənd'],0], very:[['ver','y'],['ver','i'],0],
  elephant:[['e','le','phant'],['e','lɪ','fənt'],0], family:[['fam','ily'],['fæm','li'],0], pretty:[['pret','ty'],['prɪ','ti'],0],
  africa:[['af','ri','ca'],['æf','rɪ','kə'],0], houses:[['hous','es'],['haʊz','ɪz'],0],
  beautiful:[['beau','ti','ful'],['bjuː','tɪ','fl'],0], wonderful:[['won','der','ful'],['wʌn','də','fl'],0],
  many:[['man','y'],['men','i'],0], any:[['an','y'],['en','i'],0],
  banana:[['ba','na','na'],['bə','nɑː','nə'],1], potato:[['po','ta','to'],['pə','teɪ','təʊ'],1], tomato:[['to','ma','to'],['tə','mɑː','təʊ'],1],
  about:[['a','bout'],['ə','baʊt'],1], above:[['a','bove'],['ə','bʌv'],1], away:[['a','way'],['ə','weɪ'],1],
  ago:[['a','go'],['ə','gəʊ'],1], alive:[['a','live'],['ə','laɪv'],1], asleep:[['a','sleep'],['ə','sliːp'],1],
  hotel:[['ho','tel'],['həʊ','tel'],1], only:[['on','ly'],['əʊn','li'],0], alarm:[['a','larm'],['ə','lɑːm'],1],
  police:[['po','lice'],['pə','liːs'],1], zebra:[['zeb','ra'],['zeb','rə'],0],
  create:[['cre','ate'],['kri','eɪt'],1], creation:[['cre','a','tion'],['kri','eɪ','ʃən'],1],
  real:[['real'],['rɪəl'],0], really:[['real','ly'],['rɪə','li'],0], reality:[['re','al','ity'],['ri','æl','əti'],1],
  idea:[['i','de','a'],['aɪ','dɪ','ə'],1], science:[['sci','ence'],['saɪ','əns'],0],
  quiet:[['qui','et'],['kwaɪ','ət'],0], ocean:[['o','cean'],['əʊ','ʃən'],0], special:[['spe','cial'],['spe','ʃəl'],0],
  build:[['build'],['bɪld'],0], built:[['built'],['bɪlt'],0], busy:[['bus','y'],['bɪz','i'],0], business:[['busi','ness'],['bɪz','nɪs'],0],
  geography:[['ge','og','ra','phy'],['dʒiː','ɒg','rə','fi'],1],
  finger:[['fin','ger'],['fɪŋ','gə'],0], singer:[['sin','ger'],['sɪŋ','ə'],0], angel:[['an','gel'],['eɪn','dʒəl'],0],
  danger:[['dan','ger'],['deɪn','dʒə'],0], stranger:[['stran','ger'],['streɪn','dʒə'],0], larger:[['lar','ger'],['lɑː','dʒə'],0],
  large:[['large'],['lɑːdʒ'],0], charge:[['charge'],['tʃɑːdʒ'],0],
  england:[['eng','land'],['ɪŋ','glənd'],0], english:[['eng','lish'],['ɪŋ','lɪʃ'],0],
  island:[['is','land'],['aɪ','lənd'],0], answer:[['an','swer'],['ɑːn','sə'],0],
  listen:[['lis','ten'],['lɪs','ən'],0], castle:[['cas','tle'],['kɑːs','əl'],0], whistle:[['whis','tle'],['wɪs','əl'],0],
  often:[['of','ten'],['ɒf','ən'],0], climb:[['climb'],['klaɪm'],0], doll:[['doll'],['dɒl'],0],
  our:[['our'],['aʊə'],0], hour:[['hour'],['aʊə'],0], sour:[['sour'],['saʊə'],0], flour:[['flour'],['flaʊə'],0],
  poor:[['poor'],['pʊə'],0], sure:[['sure'],['ʃʊə'],0], sugar:[['sug','ar'],['ʃʊg','ə'],0],
  were:[['were'],['wɜː'],0], are:[['are'],['ɑː'],0], eye:[['eye'],['aɪ'],0], eyes:[['eye','s'],['aɪz'],0],
  maybe:[['may','be'],['meɪ','bi'],0], whole:[['whole'],['həʊl'],0], month:[['month'],['mʌnθ'],0], monday:[['mon','day'],['mʌn','deɪ'],0],
  money:[['mon','ey'],['mʌn','i'],0], monkey:[['mon','key'],['mʌŋ','ki'],0], honey:[['hon','ey'],['hʌn','i'],0],
  minute:[['min','ute'],['mɪn','ɪt'],0], orange:[['or','ange'],['ɒr','ɪndʒ'],0],
  village:[['vil','lage'],['vɪl','ɪdʒ'],0], cabbage:[['cab','bage'],['kæb','ɪdʒ'],0],
  favourite:[['fa','vour','ite'],['feɪ','və','rɪt'],0], favorite:[['fa','vorite'],['feɪ','rə','rɪt'],0],
  tomorrow:[['to','mor','row'],['tə','mɒr','əʊ'],1],
  telephone:[['tel','e','phone'],['tel','ɪ','fəʊn'],0],
  television:[['tel','e','vi','sion'],['tel','ɪ','vɪ','ʒən'],0], vision:[['vi','sion'],['vɪ','ʒən'],0],
  decision:[['de','ci','sion'],['dɪ','sɪ','ʒən'],1],
  understand:[['un','der','stand'],['ʌn','də','stænd'],2],
  something:[['some','thing'],['sʌm','θɪŋ'],0], nothing:[['no','thing'],['nʌ','θɪŋ'],0], anything:[['an','y','thing'],['en','ɪ','θɪŋ'],0],
  animal:[['an','i','mal'],['æn','ɪ','məl'],0], alphabet:[['al','pha','bet'],['æl','fə','bet'],0],
  secret:[['se','cret'],['siː','krət'],0], question:[['ques','tion'],['kwes','tʃən'],0],
  woman:[['wom','an'],['wʊ','mən'],0], women:[['wom','en'],['wɪm','ɪn'],0],
  saturday:[['sat','ur','day'],['sæt','ə','deɪ'],0], museum:[['mu','se','um'],['mjuː','zɪ','əm'],1],
  shall:[['shall'],['ʃæl'],0], shallow:[['shal','low'],['ʃæl','əʊ'],0],
  most:[['most'],['məʊst'],0], post:[['post'],['pəʊst'],0], host:[['host'],['həʊst'],0],
  now:[['now'],['naʊ'],0], how:[['how'],['haʊ'],0], cow:[['cow'],['kaʊ'],0], wow:[['wow'],['waʊ'],0],
  horse:[['horse'],['hɔːs'],0], nurse:[['nurse'],['nɜːs'],0], purse:[['purse'],['pɜːs'],0],
  worse:[['worse'],['wɜːs'],0], verse:[['verse'],['vɜːs'],0],
  agree:[['a','gree'],['ə','griː'],1],
  study:[['stud','y'],['stʌd','i'],0], yes:[['yes'],['jes'],0], bus:[['bus'],['bʌs'],0], gas:[['gas'],['gæs'],0],
  hundred:[['hun','dred'],['hʌn','drəd'],0], playground:[['play','ground'],['pleɪ','graʊnd'],0],
  classroom:[['class','room'],['klɑːs','ruːm'],0], blackboard:[['black','board'],['blæk','bɔːd'],0],
  usually:[['u','su','al','ly'],['juː','ʒu','ə','li'],0], piano:[['pi','a','no'],['piː','ɑː','nəʊ'],1],
  giraffe:[['gi','raffe'],['dʒə','rɑːf'],1], kangaroo:[['kan','ga','roo'],['kæn','gə','ruː'],2],
  penguin:[['pen','guin'],['peŋ','gwɪn'],0], listening:[['lis','ten','ing'],['lɪs','tən','ɪŋ'],0],
  interesting:[['in','te','rest','ing'],['ɪn','tə','rəst','ɪŋ'],0], vegetable:[['vege','ta','ble'],['vedʒ','tə','bl'],0],
  chocolate:[['choc','o','late'],['tʃɒk','ə','lət'],0], afternoon:[['af','ter','noon'],['ɑːf','tə','nuː'],2],
  january:[['jan','u','a','ry'],['dʒæn','ju','ə','ri'],0], february:[['feb','ru','a','ry'],['feb','ru','ə','ri'],0],
  july:[['ju','ly'],['dʒu','laɪ'],1],
  visit:[['vis','it'],['vɪz','ɪt'],0], comfortable:[['com','for','ta','ble'],['kʌmf','tə','tə','bl'],0],
  happiness:[['hap','pi','ness'],['hæp','pɪ','nɪs'],0], sadness:[['sad','ness'],['sæd','nəs'],0],
  kindness:[['kind','ness'],['kaɪnd','nəs'],0],
  queue:[['queue'],['kjuː'],0],
};

/* ============ 基础数据 ============ */
const TEAMS3 = ['igh','augh','ough','eau','uy'];
const TEAMS2 = ['ai','ay','ea','ee','ei','eu','ew','ey','ie','oa','oe','oi','oo','ou','ow','oy','au','aw','ue','ui'];
const ONSETS = new Set(['b','c','d','f','g','h','j','k','l','m','n','p','r','s','t','v','w','y','z',
  'bl','br','ch','cl','cr','dr','dw','fl','fr','gl','gr','ph','pl','pr','qu','sc','sh','sk','sl','sm','sn','sp','st','sw','th','tr','tw','wh','wr',
  'shr','spl','spr','scr','str','thr','sch','sph']);
const DIGRAPH_FWD = new Set(['th','sh','ch','ph','gh']);   // 单元音后靠后 mo-ther
const DIGRAPH_CLOSE = new Set(['ck','tch']);               // 总是结尾 chick-en
const TH_VOICED = new Set(['the','this','that','these','those','then','than','them','there','they','their','though','thus',
  'other','another','either','neither','whether','mother','father','brother','weather','together','bother','rather','with','without','within','smooth','breathe','clothes','heather','feather','leather','northern','southern']);
const GE_HARD = new Set(['get','girl','gift','give','begin','tiger','hunger','bigger','longer','stronger','younger','manager']);
const SHORTOO = ['book','look','cook','took','foot','good','wood','hood','stood','shook','wool','cookie','football','goodbye','classroom'];
const LONG_MAP = {a:'eɪ', e:'iː', i:'aɪ', o:'əʊ', u:'juː', y:'aɪ'};
const SHORT_MAP = {a:'æ', e:'e', i:'ɪ', o:'ɒ', u:'ʌ', y:'ɪ'};
const UNSTRESSED_OPEN = {a:'ə', e:'ɪ', i:'ɪ', o:'ə', u:'ə', y:'ɪ'};
const UNSTRESSED_CLOSED = {a:'ə', e:'ə', i:'ɪ', o:'ə', u:'ə', y:'ɪ'};
const TEAM_MAP = {
  ai:'eɪ', ay:'eɪ', ei:'eɪ', ea:'iː', ee:'iː', ie:'iː', oa:'əʊ', oe:'əʊ', oo:'uː', ey:'eɪ',
  oi:'ɔɪ', oy:'ɔɪ', ou:'aʊ', au:'ɔː', aw:'ɔː', ue:'uː', ui:'uː', eu:'juː', ew:'juː',
  igh:'aɪ', augh:'ɔː', ough:'ɔː', eau:'juː', uy:'aɪ'
};
const CENTER_MAP = { a:'eə', e:'ɪə', i:'aɪə', o:'ɔː', u:'jʊə' };  // care/here/fire/more/pure
const RCODA_MAP = { ar:'ɑː', or:'ɔː', er:'ɜː', ir:'ɜː', ur:'ɜː', ear:'ɪə', eer:'ɪə', air:'eə', oar:'ɔː', oor:'ɔː', our:'ɔː', eir:'eə' };

function isVoicelessC(c){
  if(c === 'ch' || c === 'sh') return true;
  return c.length === 1 && 'ptkfcsxh'.includes(c);
}

/* ============ 后缀处理 ============ */
function trySuffix(w){
  const cut = (tail, minLen) => {
    if(!w.endsWith(tail)) return null;
    const stem = w.slice(0, w.length - tail.length);
    return (stem.length >= minLen && /[aeiouy]/.test(stem)) ? stem : null;
  };
  let stem;
  if((stem = cut('tious', 3)) !== null) return {tail:'tious', stem, mode:'card', ipa:'ʃəs', tag:'后缀-tious'};
  if((stem = cut('cious', 3)) !== null) return {tail:'cious', stem, mode:'card', ipa:'ʃəs', tag:'后缀-cious'};
  if((stem = cut('tion', 2)) !== null) return {tail:'tion', stem, mode:'card', ipa:'ʃən', tag:'后缀-tion'};
  if((stem = cut('sion', 2)) !== null) return {tail:'sion', stem, mode:'card', ipa:/[aeiouy]$/.test(stem) ? 'ʒən' : 'ʃən', tag:'后缀-sion'};
  if((stem = cut('ture', 3)) !== null) return {tail:'ture', stem, mode:'card', ipa:'tʃə', tag:'后缀-ture'};
  if((stem = cut('cial', 3)) !== null) return {tail:'cial', stem, mode:'card', ipa:'ʃəl', tag:'后缀-cial'};
  if((stem = cut('tial', 3)) !== null) return {tail:'tial', stem, mode:'card', ipa:'ʃəl', tag:'后缀-tial'};
  if((stem = cut('ious', 3)) !== null) return {tail:'ious', stem, mode:'card', ipa:'iəs', tag:'后缀-ious'};
  if((stem = cut('ous', 3)) !== null) return {tail:'ous', stem, mode:'card', ipa:'əs', tag:'后缀-ous'};
  if((stem = cut('age', 3)) !== null && !/[aeiouy]$/.test(stem)) return {tail:'age', stem, mode:'card', ipa:'ɪdʒ', tag:'后缀-age'};
  if((stem = cut('ful', 3)) !== null) return {tail:'ful', stem, mode:'card', ipa:'fl', tag:'后缀-ful'};
  if((stem = cut('ly', 2)) !== null && !/[aeiouy]$/.test(stem)) return {tail:'ly', stem, mode:'card', ipa:'li', tag:'后缀-ly'};
  /* -ed */
  if((stem = cut('ed', 3)) !== null){
    if(/[td]$/.test(stem)) return {tail:'ed', stem, mode:'card', ipa:'ɪd', tag:'后缀-ed'};
    let stemW = stem;
    const restore = /^[^aeiou]*[aeiou][b-df-hj-np-tvwxz]$/.test(stem);   // 单元音+单辅音结尾才还原 e（shav→shave）
    if(restore) stemW = stem + 'e';
    return {tail:'ed', stem, stemW, mode:'merge', ipa:isVoicelessC(stem[stem.length-1]) ? 't' : 'd', tag:'后缀-ed', restore};
  }
  /* -s / -es */
  if(w.length > 3 && w[w.length-1] === 's'){
    const c3 = w[w.length-3], two = w.slice(-2);
    if(two === 'es'){
      if('sxz'.includes(c3) || /(ch|sh)$/.test(w.slice(0, -2))){
        stem = w.slice(0, -2);
        return {tail:'es', stem, mode:'card', ipa:'ɪz', tag:'后缀-es'};      // box-es
      }
      if(c3 === 'c' || c3 === 'g'){
        stem = w.slice(0, -1);
        return {tail:'s', stem, mode:'merge', ipa:'ɪz', tag:'后缀-s'};       // change-s
      }
      if('aeiouy'.includes(c3)){
        stem = w.slice(0, -1);
        return {tail:'s', stem, mode:'merge', ipa:'z', tag:'后缀-s'};        // goe-s(=goes)
      }
      stem = w.slice(0, -1);
      return {tail:'s', stem, mode:'merge', ipa:'', tag:'', dynS:true};     // make-s
    }
    if((stem = cut('s', 3)) !== null){
      const dbl = (w[w.length-1] === w[w.length-2] && !'aeiou'.includes(w[w.length-1])) ? w[w.length-1] : null;
      return {tail:'s', stem, mode:'merge', ipa:'', tag:'', dynS:true, dbl}; // cat-s / clas-s
    }
  }
  /* -ing */
  if((stem = cut('ing', 2)) !== null){
    let stemW = stem, restore = false;
    if(/^[^aeiou]*[aeiou][b-df-hj-np-tvwxz]$/.test(stem)){ stemW = stem + 'e'; restore = true; }  // mak(e)→making
    return {tail:'ing', stem, stemW, mode:'card', ipa:'ɪŋ', tag:'后缀-ing', restore};
  }
  return null;
}

/* ============ 划分 ============ */
function markTypes(w){
  const T = [];
  for(let i = 0; i < w.length; i++){
    const ch = w[i];
    if(ch === 'y') T.push(i === 0 ? 'c' : 'v');
    else T.push(VOWELS.includes(ch) ? 'v' : 'c');
  }
  for(let i = 1; i < w.length; i++) if(w[i] === 'u' && w[i-1] === 'q') T[i] = 'c';
  return T;
}

function findGroups(w, T){
  const groups = []; let i = 0;
  while(i < w.length){
    if(T[i] === 'v'){
      let m = null;
      for(const t of TEAMS3){
        const pure = (t === 'eau' || t === 'uy');
        if(w.startsWith(t, i) && (!pure || (T[i+1] === 'v' && T[i+2] === 'v'))){ m = t; break; }
      }
      if(!m){
        for(const t of TEAMS2){
          const ok2 = (T[i+1] === 'v') || w[i+1] === 'w';   // w 在元音后可作组合成员 (ow/aw/ew)
          if(w.startsWith(t, i) && ok2){
            if(t === 'ie' && w[i+2] === 't') continue; // quiet / diet
            m = t; break;
          }
        }
      }
      if(m){ groups.push({start:i, end:i+m.length-1, letters:m}); i += m.length; }
      else { groups.push({start:i, end:i, letters:w[i]}); i++; }
    } else i++;
  }
  return groups;
}

function analyzeCore(w, depth){
  depth = depth || 0;

  /* 1) 后缀 */
  const suf = trySuffix(w);
  if(suf){
    const stemRes = analyzeStem(suf.stemW || suf.stem, depth + 1);
    const last = stemRes.sylls[stemRes.sylls.length - 1];
    if(stemRes.magicShape){ last.magicOwn = stemRes.magicShape; }
    if(suf.mode === 'card'){
      if(suf.restore && last.text.endsWith('e') && last.text.length > 2) last.text = last.text.slice(0, -1);
      stemRes.sylls.push({text:suf.tail, suffix:suf.ipa, isLE:false, wordStart:suf.stem.length});
      stemRes.boundaries.push(suf.tag);
    } else {
      last.coreText = last.text;
      last.text += suf.tail;
      last.merged = suf.dynS ? {dynS:true} : {end:suf.ipa};
      if(suf.tag) stemRes.boundaries.push(suf.tag);
    }
    if(suf.dbl) stemRes.doubleTail = suf.dbl;
    stemRes.word = w;
    return stemRes;
  }

  /* 2) 元音组 */
  const T = markTypes(w);
  const groups = findGroups(w, T);
  const n = w.length;
  if(groups.length === 0) return {word:w, sylls:[{text:w, vStart:0, vEnd:0, wordStart:0, ipa:[]}], boundaries:[], stress:0};

  /* 3) 词尾形状（不发音 e / 辅音+le） */
  let magicShape = null;
  if(n >= 3 && w[n-1] === 'e' && groups.length >= 2){
    if(w[n-2] === 'r' && T[n-3] === 'v') magicShape = 'center';      // care
    else if(T[n-2] === 'c' && T[n-3] === 'v') magicShape = 'long';   // cake
    else if(n >= 5 && T[n-4] === 'v'){
      const cc = w.slice(n-3, n-1);
      if(cc === 'st') magicShape = 'long';                            // taste
      else if(cc === 'ng') magicShape = 'ng';                         // change
      else if(cc === 'dg' || cc === 'nc' || cc === 'ns') magicShape = 'short'; // bridge/prince
    }
  }
  if(magicShape && groups[groups.length-1].start === n-1) groups.pop();

  let leSyl = null;
  if(!magicShape && n >= 3 && w.endsWith('le') && T[n-3] === 'c'){
    if(groups.length >= 2 && groups[groups.length-1].start === n-1) groups.pop();
    leSyl = {start:n-3, end:n-1};
  }

  /* 4) 音节槽与切分 */
  const slots = groups.map(g => ({kind:'v', start:g.start, end:g.end}));
  if(leSyl) slots.push({kind:'le', start:leSyl.start, end:leSyl.end});

  const cuts = [0]; const boundaries = [];
  for(let s = 0; s < slots.length - 1; s++){
    const a = slots[s].end + 1, b = slots[s+1].start;
    const run = w.slice(a, b), k = b - a;
    const nextIsLE = slots[s+1].kind === 'le';
    let i;
    if(k === 0){ i = 0; boundaries.push('元音相接'); }
    else if(k === 1){
      i = (run === 'x') ? 1 : (nextIsLE ? 1 : 0);
      boundaries.push(run === 'x' ? 'x 靠前' : (nextIsLE ? '二分手' : '一靠后'));
    }
    else if(k === 2){
      if(DIGRAPH_CLOSE.has(run)){ i = 2; boundaries.push('组合不拆'); }
      else if(DIGRAPH_FWD.has(run)){
        const before = w.slice(slots[s].start, slots[s].end + 1);
        i = (before.length > 1) ? 2 : 0;
        boundaries.push('组合不拆');
      }
      else { i = 1; boundaries.push('二分手'); }
    }
    else {
      const head2 = run.slice(0, 2);
      if(DIGRAPH_CLOSE.has(head2) || DIGRAPH_FWD.has(head2) || head2 === 'ng'){ i = 2; boundaries.push('组合不拆'); }
      else {
        i = k - 1;
        for(const cand of [1, 2, k-1]){ if(ONSETS.has(run.slice(cand))){ i = cand; break; } }
        boundaries.push('多辅音偏分');
      }
    }
    cuts.push(a + i);
  }
  cuts.push(n);

  const sylls = [];
  for(let s = 0; s < slots.length; s++){
    const cs = cuts[s];
    let ce = (s === slots.length - 1) ? n : cuts[s+1];
    ce = Math.max(ce, slots[s].end + 1);
    const text = w.slice(cs, ce);
    let rDropped = false;
    if(s < slots.length - 1 && text.endsWith('r') && w[ce] === 'r') rDropped = true;
    sylls.push({
      text, wordStart:cs,
      vStart:slots[s].start, vEnd:slots[s].end,
      isLE: slots[s].kind === 'le', suffix:null, rDropped
    });
  }
  return {word:w, sylls, boundaries, magicShape};
}

function isVoicedPh(p){
  if(!p) return true;
  return !('ptkfcsθʃ'.includes(p) || p === 'tʃ');
}

/* ============ 重音 ============ */
function findStress(word, sylls){
  const n = sylls.length;
  if(n <= 1) return 0;
  if(n === 2 && sylls[0].text === 'a') return 1;
  if(/(ous|et|ry|ly)$/.test(word)) return Math.max(0, n-3);
  if(/(tion|sion|cial|tial|tious|cious|ture|ful|ic|ant|ent|ance|ence|ive|ial|ual|ity|ify|ess|age|ing)$/.test(word)) return n-2;
  if(/(er|or|ar|le|a)$/.test(word) || /(?<![aeiou])y$/.test(word)) return n-2;
  if(n === 2) return 0;
  return Math.max(0, n-3);
}

/* ============ 音标 ============ */
function consMap(ch, nextCh, ctx){
  const nx = nextCh || (ctx && ctx.next) || '';
  const soft = nx !== '' && 'eiy'.includes(nx);
  switch(ch){
    case 'c': return soft ? 's' : 'k';
    case 'g': {
      if(ctx && (ctx.gerFinal || GE_HARD.has(ctx.word))) return 'g';
      return soft ? 'dʒ' : 'g';
    }
    case 'x': return 'ks';
    case 'j': return 'dʒ';
    case 'q': return 'k';
    case 'y': return 'j';
    default: return ch;
  }
}

function consPhonemes(letters, ctx){
  const out = [];
  let i = 0;
  const push = (p) => { if(p) out.push(p); };
  while(i < letters.length){
    const rest = letters.slice(i);
    let ph = null, step = 1;
    if(rest.startsWith('tch')){ ph = 'tʃ'; step = 3; }
    else if(rest.startsWith('dge') || (rest.startsWith('dg') && ctx.tail === 'e')){ ph = 'dʒ'; step = rest.startsWith('dge') ? 3 : 2; }
    else if(rest.startsWith('nge')){ out.push('n'); push('dʒ'); i += 3; continue; }
    else if(rest.startsWith('ch')){ ph = 'tʃ'; step = 2; }
    else if(rest.startsWith('sh')){ ph = 'ʃ'; step = 2; }
    else if(rest.startsWith('th')){ ph = TH_VOICED.has(ctx.word) ? 'ð' : 'θ'; step = 2; }
    else if(rest.startsWith('ph')){ ph = 'f'; step = 2; }
    else if(rest.startsWith('wh')){ ph = 'w'; step = 2; }
    else if(rest.startsWith('ck')){ ph = 'k'; step = 2; }
    else if(rest.startsWith('ng')){ ph = 'ŋ'; step = 2; }
    else if(rest.startsWith('qu')){ out.push('k'); push('w'); i += 2; continue; }
    else if(rest.startsWith('gh')){ ph = ''; step = 2; }
    else if(rest.startsWith('kn') && ctx.absPos + i === 0){ ph = 'n'; step = 2; }
    else if(rest.startsWith('wr') && ctx.absPos + i === 0){ ph = 'r'; step = 2; }
    else if(rest.startsWith('mb') && ctx.absPos + i + 1 === ctx.wordLen - 1){ ph = 'm'; step = 2; }
    else if(letters[i] === 'e' && ctx.tail === 'e' && i === letters.length - 1){ i += 1; continue; }  // 不发音 e
    else if(letters[i] === letters[i+1]){ ph = consMap(letters[i], letters[i+2], ctx); step = 2; }
    else if(letters[i] === 'n' && (letters[i+1] === 'k' || letters[i+1] === 'g')){ out.push('ŋ'); i += 1; continue; }
    else ph = consMap(letters[i], letters[i+1], ctx);
    if(ph === 'ks'){ out.push('k'); push('s'); }
    else push(ph);
    i += step;
  }
  return out;
}

function aSpecial(coda, dbl){
  const c = dbl ? coda + dbl : coda;
  if(/^(nc|ns|st|sk|ss|ft|lf|sp)/.test(c)) return 'ɑː';
  if(/^(ll|lk)/.test(c)) return 'ɔː';
  return null;
}

function vowelPhoneme(vv, coda, o){
  if(o.rDropped) return vv === 'o' ? 'ʌ' : (SHORT_MAP[vv] || 'æ');
  if(o.magicShape === 'center' && coda === 're'){
    return CENTER_MAP[vv] || 'ə';
  }
  if(coda === 'r'){
    const key = vv + 'r';
    if(RCODA_MAP[key] !== undefined){
      if(!o.stressed && (key === 'er' || key === 'or' || key === 'ar' || key === 'ur')) return 'ə';
      return RCODA_MAP[key];
    }
    if(vv.length === 1 && !o.stressed && o.isLast) return 'ə';
  }
  if(o.magicShape === 'long' || o.magicShape === 'ng'){
    if(TEAM_MAP[vv]) return TEAM_MAP[vv];
    if(o.magicShape === 'ng' && (vv === 'o' || vv === 'u')) return SHORT_MAP[vv] || 'ɒ';
    if(vv === 'u' && (o.prevL === 'r' || o.prevL === 'l' || o.prevL === 'j')) return 'uː';
    return LONG_MAP[vv] || 'ə';
  }
  if(o.magicShape === 'short'){
    if(vv === 'a'){ const sp = aSpecial(coda, o.dbl); if(sp) return sp; }
    return SHORT_MAP[vv] || 'æ';
  }
  if(TEAM_MAP[vv]){
    if(vv === 'ow') return o.isLast ? 'əʊ' : 'aʊ';
    if(vv === 'ie') return o.isLast ? ((o.sylCount || 1) === 1 ? 'aɪ' : 'ɪ') : 'iː';   // pie vs cities
    if(vv === 'ey') return (o.isLast && !o.stressed) ? 'ɪ' : 'eɪ';
    if(vv === 'ew' || vv === 'eu') return (o.prevL === 'r' || o.prevL === 'l') ? 'uː' : 'juː';
    if(vv === 'oo') return SHORTOO.some(s => o.word.includes(s)) ? 'ʊ' : 'uː';
    return TEAM_MAP[vv];
  }
  if(coda.length === 0){
    if(o.stressed){
      if(vv === 'u') return (o.prevL === 'r' || o.prevL === 'l' || o.prevL === 'j') ? 'uː' : 'juː';
      return LONG_MAP[vv] || 'ə';
    }
    return UNSTRESSED_OPEN[vv] || 'ə';
  }
  if(o.stressed){
    if(vv === 'a'){ const sp = aSpecial(coda, o.dbl); if(sp) return sp; }
    if(vv === 'i' && /^(nd|ld)/.test(coda)) return 'aɪ';
    if(vv === 'o' && /^ld/.test(coda)) return 'əʊ';
    return SHORT_MAP[vv] || 'æ';
  }
  return UNSTRESSED_CLOSED[vv] || 'ə';
}

function sylIPA(res, idx){
  const syl = res.sylls[idx];
  const w = res.word;
  const appendMerged = (ps) => {
    if(!syl.merged) return ps;
    if(syl.merged.dynS) return ps.concat([isVoicedPh(ps[ps.length-1]) ? 'z' : 's']);
    return ps.concat(parseIPA(syl.merged.end));
  };
  if(syl.irrIpa) return parseIPA(syl.irrIpa);
  if(syl.suffix) return parseIPA(syl.suffix);
  if(syl.isLE){
    return appendMerged([...consPhonemes(syl.coreText ? syl.coreText.slice(0, -2) : syl.text.slice(0, -2), mkCtx(w, syl)), 'ə', 'l']);
  }
  const s = syl.coreText || syl.text;
  const rel = syl.vStart - syl.wordStart;
  const vLen = syl.vEnd - syl.vStart + 1;
  const onsetS = s.slice(0, rel), vowelS = s.slice(rel, rel + vLen);
  let codaS = s.slice(rel + vLen);
  const isLast = idx === res.sylls.length - 1;
  const stressed = idx === res.stress;
  const prevL = onsetS ? onsetS[onsetS.length-1] : (w[syl.wordStart-1] || '');
  const magicShape = syl.magicOwn || (isLast ? res.magicShape : null);
  let strippedE = false;
  if(magicShape && magicShape !== 'center' && codaS.endsWith('e') && codaS.length >= 2){ codaS = codaS.slice(0, -1); strippedE = true; }

  const vo = {stressed, word:w, magicShape, isLast, rDropped:syl.rDropped, prevL,
              dbl:(isLast ? res.doubleTail : null), sylCount:res.sylls.length};
  let v, codaP;
  if(magicShape === 'center' && codaS === 're'){
    v = CENTER_MAP[vowelS] || 'ə';
    codaP = [];
  } else if(codaS.startsWith('r') && !syl.rDropped){
    const key = vowelS + 'r';
    if(RCODA_MAP[key] !== undefined){
      v = stressed ? RCODA_MAP[key] : ((key === 'ar' || key === 'or' || key === 'er' || key === 'ur') ? 'ə' : RCODA_MAP[key]);
      const ctx = mkCtx(w, syl);
      ctx.next = codaS.slice(1)[0] || '';
      codaP = consPhonemes(codaS.slice(1), ctx);
    }
  }
  if(v === undefined){
    v = vowelPhoneme(vowelS, codaS, vo);
    const ctx = mkCtx(w, syl);
    ctx.next = strippedE ? 'e'
      : (syl.merged ? (syl.text[s.length] || '')                 /* 后缀首字母，如 danced 的 e */
      : (isLast ? '' : (res.sylls[idx+1] ? res.sylls[idx+1].text[0] : '')));
    ctx.tail = strippedE ? 'e' : '';
    codaP = consPhonemes(codaS + (strippedE ? 'e' : ''), ctx);
  }
  const ctx2 = mkCtx(w, syl);
  ctx2.next = vowelS[0];
  ctx2.gerFinal = isLast && /(ger|gest|est)$/.test(s) && /^(g|str)/.test(s);   // tiger/biggest 的 g 不软化
  const onsetP = consPhonemes(onsetS, ctx2);
  if(syl.rDropped && codaP[codaP.length-1] === 'r') codaP.pop();
  /* 词尾 s 浊化（非后缀 -s 情况） */
  if(isLast && !syl.merged && codaP[codaP.length-1] === 's'){
    const before = codaP.length >= 2 ? codaP[codaP.length-2] : v;
    if(isVoicedPh(before)) codaP[codaP.length-1] = 'z';
  }
  const fix = p => PHONEMES.includes(p) ? [p] : parseIPA(p);   // 复合音(如 aɪə/juː)拆为单独音频
  return appendMerged([...onsetP, v, ...codaP].flatMap(fix));
}

function mkCtx(w, syl){
  return {word:w, wordLen:w.length, absPos:syl.wordStart || 0, next:'', tail:'', gerFinal:false};
}

/* ============ 汇总 ============ */
function analyzeStem(w, depth){
  const irr = IRREGULAR[w];
  if(irr && irr[0].length === irr[1].length && irr[0].join('') === w){
    const [d, p, s] = irr;
    const norm = str => str.replace(/i(?![ː])/g, 'ɪ').replace(/u(?![ː])/g, 'ʊ');  // 裸 i/u 规范化
    const res = {word:w, stress:s, sylls:d.map(t => ({text:t, irrIpa:null, wordStart:0})), boundaries:[], irregular:true};
    p.forEach((ipa, i) => { res.sylls[i].irrIpa = norm(ipa); });
    let off = 0;
    res.sylls.forEach(sy => { sy.wordStart = off; off += sy.text.length; });
    return res;
  }
  return analyzeCore(w, depth);
}

function analyze(raw){
  let w = (raw||'').toLowerCase().trim().replace(/[^a-z]/g,'');
  if(!w) return null;
  return finalize(analyzeStem(w));
}

function finalize(res){
  if(res.stress === undefined) res.stress = findStress(res.word, res.sylls);
  res.sylls.forEach((s, i) => { s.ipa = sylIPA(res, i); });
  if(res.stress >= res.sylls.length) res.stress = 0;
  res.ipaText = res.sylls.map((s, i) => (i === res.stress && res.sylls.length > 1 ? 'ˈ' : '') + s.ipa.join('')).join('.');
  return res;
}

export { analyze, markTypes, PHONEMES };
