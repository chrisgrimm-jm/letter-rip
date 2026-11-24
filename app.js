// Letter Rip — shared by index.html (host) and display.html (audience).
// The host owns all game state and publishes it to Firebase; the display just renders what it receives.
const $ = id => document.getElementById(id);
const HOST = document.body.dataset.role === 'host';
const COLS = 14, ROWS = 4, VOWELS = 'AEIOU';
const PCOLORS = ['#E40000','#00B7FF','#00B13C','#4329E3'];
const WEDGE_COLORS = ['#E40000','#00B7FF','#FCFF7A','#00B13C','#4329E3','#ff7a1a','#ff4fa3','#14d9c4'];
const MODE_NAMES = {normal:'', toss:'Toss-Up', speed:'Speed-Up', bonus:'Bonus Round'};
const FIREBASE_CONFIG = { apiKey:'AIzaSyBG2PS2muH4i27HefuLeBnZWW-TZ5dkMCw', databaseURL:'https://pinpoint-abf21-default-rtdb.firebaseio.com', projectId:'pinpoint-abf21' };
const DEFAULTS = {
  title: 'Letter Rip',
  topic: Math.random().toString(36).slice(2,6).toUpperCase(),
  hostSound: false,
  puzzles: 'Ballpark Snack | GARLIC FRIES WITH EXTRA PARMESAN\nThing | A SEVENTH INNING STRETCH\nPhrase | THAT BALL IS OUTTA HERE\nPlace | THE BULLPEN\nWhat Are You Doing? | ARGUING BALLS AND STRIKES\nPhrase | WALK IT OFF',
  names: ['Player 1','Player 2','Player 3','Player 4'],
  numPlayers: 3, vowelPrice: 250,
  tossPrize: 1000, tossSpeed: 1, bonusPrize: 25000, bonusClock: 10, bonusStart: 'RSTLNE', bonusCons: 3, bonusVowels: 1,
  wedges: '500,300,900,BUST,600,400,700,350,800,PASS,450,550,1000,300,BUST,650,500,400,750,350,600,2500,500,850'
};
const store = { get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch{ return null; } },
                set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} } };
let cfg = {...DEFAULTS, ...(HOST ? store.get('wnf') : {})};
if(HOST) store.set('wnf', cfg);   // pins the generated room code
let g = freshGame();
let outbox = [];                  // effects (flips, sounds) produced since the last render

function freshGame(){
  return {players: cfg.names.slice(0,cfg.numPlayers).map(n=>({name:n,round:0,total:0})),
    turn:0, puzzleIdx:-1, cat:'', grid:null, used:[], shown:[], spun:null, solved:true, rot:0, spinning:false,
    mode:'normal', paused:false, picks:[], stage:'', clock:null, fxId:0,
    wheel:{open:false, who:'', val:'', hub:''}};
}
const money = n => '$' + Number(n).toLocaleString();
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fbKey = s => String(s).trim().replace(/[.#$\[\]\/\s]+/g,'-') || 'default';

/* ---------- puzzle parsing + layout ---------- */
function parsePuzzles(text){
  return text.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
    const [cat, ...rest] = l.split('|');
    return rest.length ? {cat:cat.trim(), text:rest.join('|').trim().toUpperCase()} : {cat:'', text:cat.trim().toUpperCase()};
  });
}
// greedy word wrap into ≤4 rows of ≤14, centered. Returns 4 strings of 14 chars (' ' = empty slot) or an error string.
function layout(text){
  const lines = [];
  for(const w of text.split(/\s+/).filter(Boolean)){
    if(w.length > COLS) return `"${w}" is longer than ${COLS} letters`;
    const last = lines[lines.length-1];
    if(last !== undefined && last.length + 1 + w.length <= COLS) lines[lines.length-1] = last + ' ' + w;
    else lines.push(w);
  }
  if(lines.length > ROWS) return `needs ${lines.length} rows (max ${ROWS})`;
  const grid = Array(ROWS).fill(' '.repeat(COLS));
  const top = Math.floor((ROWS - lines.length)/2);
  lines.forEach((ln,r)=>{ const off = Math.floor((COLS-ln.length)/2);
    grid[top+r] = ' '.repeat(off) + ln + ' '.repeat(COLS-off-ln.length); });
  return grid;
}

/* ---------- drawing (both pages) ---------- */
const tiles = [];
for(let i=0;i<ROWS*COLS;i++){ const t=document.createElement('div'); t.className='tile'; $('board').appendChild(t); tiles.push(t); }
const isLetter = ch => ch >= 'A' && ch <= 'Z';
const chAt = i => { const ch = g.grid?.[Math.floor(i/COLS)][i%COLS]; return ch && ch !== ' ' ? ch : null; };
const visible = i => { const ch = chAt(i); return !isLetter(ch) || g.solved || g.used.includes(ch) || g.shown.includes(i); };
const hiddenTiles = () => tiles.map((_,i)=>i).filter(i => chAt(i) && !visible(i));

function letterEnabled(L){
  if(!g.grid || g.solved || g.used.includes(L) || g.mode==='toss') return false;
  if(g.mode==='bonus') return g.stage==='pick';
  return true;
}
function draw(){
  tiles.forEach((t,i)=>{ const ch = chAt(i); t.className = 'tile' + (ch ? ' on' : ''); t.textContent = ch && visible(i) ? ch : ''; });

  $('letters').innerHTML = '';
  for(const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
    const b = document.createElement('button'); b.textContent = L;
    b.className = (VOWELS.includes(L) ? 'v' : '') + (g.picks.includes(L) ? ' pick' : '') + (g.used.includes(L) ? ' used' : '');
    if(HOST){ b.disabled = !letterEnabled(L); b.onclick = () => guess(L); }
    $('letters').appendChild(b);
  }

  $('players').innerHTML = '';
  g.players.forEach((p,i)=>{
    const d = document.createElement('div');
    d.className = 'p' + (i===g.turn ? ' turn' : ''); d.style.setProperty('--c', PCOLORS[i]);
    d.innerHTML = `<div class="name"></div><div class="round">${money(p.round)}</div><div class="total">TOTAL <span>${money(p.total)}</span></div>`;
    d.querySelector('.name').textContent = p.name;
    if(HOST) d.onclick = e => {
      if(e.target.classList.contains('round')) return editScore(i,'round');
      if(e.target.closest('.total')) return editScore(i,'total');
      pickPlayer(i);
    };
    $('players').appendChild(d);
  });

  const v = $('value'); v.className = '';
  if(g.mode==='toss'){ $('valueLbl').textContent='TOSS-UP PRIZE'; $('valueTxt').textContent = money(cfg.tossPrize); }
  else if(g.mode==='bonus' && (g.stage==='clock' || g.stage==='done')){
    $('valueLbl').textContent = 'CLOCK'; v.className = 'clock' + (g.clock <= 3 ? ' low' : ''); $('valueTxt').textContent = g.clock; }
  else if(g.mode==='bonus'){ $('valueLbl').textContent='BONUS PRIZE'; $('valueTxt').textContent = money(cfg.bonusPrize); }
  else { $('valueLbl').textContent = g.mode==='speed' ? 'SPEED-UP VALUE' : 'SPIN VALUE'; $('valueTxt').textContent = g.spun == null ? '—' : money(g.spun); }

  const t = esc(cfg.title), joiner = /\s(and|&amp;|of|the|or)\s/i;   // highlight the joining word, else the last word
  $('logo').innerHTML = joiner.test(t) ? t.replace(joiner, ' <b>$1</b> ') : t.replace(/(\s)(\S+)$/, '$1<b>$2</b>');
  document.title = cfg.title + (HOST ? ' — Host' : '');
  $('category').textContent = g.grid ? g.cat : '';
  $('modeTag').textContent = g.grid ? MODE_NAMES[g.mode] : '';
  $('modeTag').className = g.mode;
  drawWheelState();
}

/* ---------- effects: run here, and replayed on the display ---------- */
function fx(type, data){ outbox.push({type, data}); }
function runFx(list){
  for(const e of list){
    if(e.type==='flip') flipTiles(e.data);
    else if(e.type==='sound' && (!HOST || cfg.hostSound)) sfx[e.data]?.();
  }
}
// light up then flip tiles one by one: data = {list:[[tileIndex, letter]], gap, delay}
function flipTiles({list, gap=450, delay=700}){
  list.forEach(([i,L],n)=>{
    tiles[i].textContent = '';
    if(delay) tiles[i].classList.add('lit');
    setTimeout(()=>{ tiles[i].classList.remove('lit','flip'); void tiles[i].offsetWidth;
      tiles[i].textContent = L; tiles[i].classList.add('flip'); if(!HOST || cfg.hostSound) (delay ? sfx.ding() : sfx.blip()); }, delay + n*gap);
  });
}

/* ---------- sync ---------- */
let fbRef = null;
try{
  firebase.initializeApp(FIREBASE_CONFIG);
  const topic = HOST ? cfg.topic : new URLSearchParams(location.search).get('topic');
  if(topic) fbRef = firebase.database().ref(`letterrip/${fbKey(topic)}/state`);
  if(HOST) firebase.database().ref('.info/connected').on('value', s => {
    $('conn').className = s.val() ? 'on' : ''; $('conn').textContent = (s.val() ? 'DISPLAY LIVE · ROOM ' : 'OFFLINE · ROOM ') + cfg.topic; });
}catch(err){ console.warn('Firebase unavailable', err); }

function render(){             // host: draw, play effects, publish
  draw();
  if(!HOST) return;
  hostDraw();
  if(outbox.length) g.fxId++;
  const sent = outbox; outbox = [];
  runFx(sent);
  const {tossTimer, clockTimer, ...pub} = g;
  store.set('wnf-game', pub);  // survives a host refresh
  const view = {title:cfg.title, tossPrize:cfg.tossPrize, bonusPrize:cfg.bonusPrize, wedges:cfg.wedges, hostSound:false};
  fbRef?.set({json: JSON.stringify({g:pub, view, fx:sent}), t: Date.now()});
}
if(!HOST){
  let lastFx = null;
  if(!fbRef){ $('category').textContent = 'Open this page from the host’s “Open Display” button'; }
  fbRef?.on('value', snap => {
    const val = snap.val(); if(!val) return;
    const s = JSON.parse(val.json);
    const first = lastFx === null;
    Object.assign(cfg, s.view); g = s.g;
    draw();
    if(!first && s.g.fxId !== lastFx) runFx(s.fx || []);
    lastFx = s.g.fxId;
  });
}

/* ---------- wheel ---------- */
const wheelCv = $('wheel'), wctx = wheelCv.getContext('2d');
let wedges = [], drawnWedges = '', shownRot = null;
function drawWheel(){
  drawnWedges = cfg.wedges;
  wedges = cfg.wedges.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const n = wedges.length, R = 860, cx = 860, step = 2*Math.PI/n;
  wctx.clearRect(0,0,1720,1720);
  wedges.forEach((w,i)=>{
    const a0 = -Math.PI/2 + i*step, a1 = a0 + step;
    const fill = w==='BUST' ? '#0b0a10' : w==='PASS' ? '#ffffff' : WEDGE_COLORS[i % WEDGE_COLORS.length];
    wctx.beginPath(); wctx.moveTo(cx,cx); wctx.arc(cx,cx,R,a0,a1); wctx.closePath();
    wctx.fillStyle = fill; wctx.fill(); wctx.lineWidth = 6; wctx.strokeStyle = '#1A1823'; wctx.stroke();
    wctx.save(); wctx.translate(cx,cx); wctx.rotate(a0 + step/2);   // text reads from rim toward center
    const dark = fill==='#FCFF7A' || fill==='#ffffff' || fill==='#14d9c4' || fill==='#00B7FF';
    wctx.fillStyle = w==='BUST' ? '#E40000' : dark ? '#1A1823' : '#ffffff';
    wctx.font = `italic ${Math.min(130, 2400/n)}px "Bebas Neue", Impact, sans-serif`;
    wctx.textAlign = 'right'; wctx.textBaseline = 'middle';
    wctx.fillText(/^\d+$/.test(w) ? '$' + w : w, R - 40, 6);
    wctx.restore();
  });
}
function drawWheelState(){
  if(cfg.wedges !== drawnWedges) drawWheel();
  $('wheelOv').classList.toggle('show', g.wheel.open);
  $('landedWho').textContent = g.wheel.who; $('landedVal').textContent = g.wheel.val; $('hub').innerHTML = g.wheel.hub;
  if(g.rot !== shownRot){
    wheelCv.style.transition = shownRot === null ? 'none' : 'transform 5.2s cubic-bezier(.12,.6,.12,1)';
    wheelCv.style.transform = `rotate(${g.rot}deg)`; shownRot = g.rot;
  }
}
document.fonts.ready.then(drawWheel);

/* ---------- sound (synthesized, no files) ---------- */
let ac; const audio = () => ac ||= new (window.AudioContext||window.webkitAudioContext)();
function tone(f, dur, type='sine', vol=.18, when=0){
  try{ const a=audio(), o=a.createOscillator(), gn=a.createGain(), t=a.currentTime+when;
    o.type=type; o.frequency.value=f; gn.gain.setValueAtTime(vol,t); gn.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(gn).connect(a.destination); o.start(t); o.stop(t+dur); }catch{}
}
const sfx = {
  ding(){ tone(1320,.5,'triangle',.22); tone(1980,.35,'sine',.08); },
  blip(){ tone(880,.12,'triangle',.12); },
  buzz(){ tone(110,.6,'sawtooth',.15); tone(116,.6,'sawtooth',.12); },
  buzzIn(){ tone(660,.15,'square',.15); tone(990,.25,'square',.12,.12); },
  load(){ [523,659,784].forEach((f,i)=>tone(f,.25,'triangle',.15,i*.09)); },
  win(){ [523,659,784,1047,784,1047].forEach((f,i)=>tone(f,.3,'triangle',.18,i*.12)); },
  clock(){ tone(900,.1,'square',.08); },
  clockLow(){ tone(1200,.1,'square',.1); },
  spin(){ let t=0, gap=.04; while(t<5){ tone(2200,.03,'square',.05,t); t+=gap; gap*=1.07; } }
};
// Browsers block audio until the page is clicked once. For OBS, tick "Control audio via OBS".
addEventListener('pointerdown', () => audio().resume?.(), {once:true});

function fit(){ const s = Math.min(innerWidth/1920, innerHeight/1080); $('stage').style.transform = `translate(-50%,-50%) scale(${s})`; }
addEventListener('resize', fit); fit();

if(!HOST){ draw(); }
else {
/* ================= HOST ONLY ================= */
const saved = store.get('wnf-game');
if(saved?.players?.length === cfg.numPlayers){
  g = {...freshGame(), ...saved, spinning:false, wheel:{open:false, who:'', val:'', hub:''}};
  if(g.mode==='toss' && !g.solved) g.paused = true;       // timers don't survive a refresh
  if(g.stage==='clock') g.stage = 'ready';
}

function hostDraw(){
  const pz = parsePuzzles(cfg.puzzles), noMore = g.puzzleIdx + 1 >= pz.length || !g.solved;
  ['btnLoad','btnToss','btnSpeed','btnBonus'].forEach(id => $(id).disabled = noMore);
  const live = g.grid && !g.solved;
  $('btnSolve').disabled = $('btnReveal').disabled = !live;
  $('btnSpin').disabled = !live || g.spun != null || g.mode==='toss' || g.mode==='bonus';
  $('btnNext').disabled = g.mode==='bonus' && live;
  const a = $('btnAction'); a.hidden = true;
  if(live && g.mode==='toss'){ a.hidden = false; a.textContent = g.paused ? 'Resume' : 'Pause'; }
  if(live && g.mode==='bonus' && g.stage==='pick'){ a.hidden = false; a.textContent = 'Reveal Picks'; }
  if(live && g.mode==='bonus' && g.stage==='ready'){ a.hidden = false; a.textContent = 'Start Clock'; }
  $('status2').textContent = pz.length ? `Puzzle ${Math.max(g.puzzleIdx+1,0)} of ${pz.length}` : 'No puzzles — open Setup';
}
function status(msg){ $('status').textContent = msg; }
const displayUrl = () => new URL(`display.html?topic=${encodeURIComponent(cfg.topic)}`, location.href).href;

/* ---------- shared actions ---------- */
function nextTurn(msg){
  g.turn = (g.turn + 1) % g.players.length;
  if(g.mode !== 'speed') g.spun = null;
  status((msg ? msg + ' ' : '') + g.players[g.turn].name + "'s turn."); render();
}
function stopTimers(){ clearInterval(g.tossTimer); clearInterval(g.clockTimer); g.tossTimer = g.clockTimer = null; }
function loadPuzzle(mode){
  const pz = parsePuzzles(cfg.puzzles);
  const idx = g.puzzleIdx + 1; if(idx >= pz.length || !g.solved) return;
  const grid = layout(pz[idx].text);
  if(typeof grid === 'string'){ alert(`Puzzle ${idx+1} ${grid}. Fix it in Setup.`); return; }
  stopTimers();
  Object.assign(g, {puzzleIdx:idx, cat:pz[idx].cat, grid, used:[], shown:[], spun:null, solved:false,
    mode, paused:false, picks:[], stage:'', clock:null});
  fx('sound','load');
  const p = g.players[g.turn];
  if(mode==='normal' || mode==='speed') g.players.forEach(q=>q.round=0);
  if(mode==='normal') status(p.name + ' — spin or buy a vowel.');
  if(mode==='speed') status('Spin once to set the speed-up value. Every consonant is worth it, vowels are free, and the turn passes after each letter.');
  if(mode==='toss'){ status('Letters fill in on their own. Click a player (or press 1–4) when they buzz in.'); startToss(); }
  if(mode==='bonus') startBonus();
  render();
}
function positions(L){
  const out=[]; for(let i=0;i<tiles.length;i++) if(chAt(i)===L) out.push(i); return out;
}
function pickPlayer(i){
  g.turn = i;
  if(g.mode==='toss' && !g.solved){ g.paused = true; fx('sound','buzzIn'); status(`${g.players[i].name} buzzed in! Solved! if right, Resume if wrong.`); }
  render();
}
function guess(L){
  if(!letterEnabled(L) || g.spinning) return;
  if(g.mode==='bonus') return pickBonus(L);
  const p = g.players[g.turn], vowel = VOWELS.includes(L), speed = g.mode==='speed';
  if(g.spun == null && (speed || !vowel)) return status(speed ? 'Spin first to set the speed-up value.' : 'Spin first, then call a consonant.');
  if(vowel && !speed){
    if(p.round < cfg.vowelPrice) return status(`${p.name} needs ${money(cfg.vowelPrice)} to buy a vowel.`);
    p.round -= cfg.vowelPrice;
  }
  g.used.push(L);
  const hits = positions(L);
  if(!hits.length){ fx('sound','buzz'); return nextTurn(`No ${L}.`); }
  const won = vowel ? 0 : g.spun * hits.length;
  p.round += won;
  const msg = `${hits.length} ${L}${hits.length>1?"'s":''}!` + (won ? ` +${money(won)}.` : '');
  if(speed){ g.turn = (g.turn+1) % g.players.length; status(`${msg} ${g.players[g.turn].name}, letter or solve?`); }
  else { g.spun = null; status(msg + ' Spin, buy, or solve.'); }
  fx('flip', {list: hits.map(i=>[i,L])});
  render();
  if(!hiddenTiles().length) setTimeout(()=>status('Every letter is up. Someone solve it!'), 800 + hits.length*450);
}
function solve(){
  if(!g.grid || g.solved) return;
  stopTimers();
  const p = g.players[g.turn];
  if(g.mode==='toss'){ p.total += cfg.tossPrize; status(`${p.name} wins the toss-up: ${money(cfg.tossPrize)}!`); }
  else if(g.mode==='bonus'){ p.total += cfg.bonusPrize; status(`${p.name} wins the bonus round: ${money(cfg.bonusPrize)}!`); }
  else { p.total += p.round; g.players.forEach(q=>q.round=0); status(`${p.name} solves it and banks it!`); }
  g.solved = true; g.spun = null; fx('sound','win'); render();
}
function revealAll(){
  if(!g.grid) return;
  stopTimers(); g.solved = true; g.spun = null;
  if(g.mode==='normal' || g.mode==='speed') g.players.forEach(q=>q.round=0);
  status('Puzzle revealed. No one banks.'); render();
}
function editScore(i, key){
  const p = g.players[i];
  const v = prompt(`${p.name}'s ${key} score.\nType a number to set it, or +100 / -100 to adjust:`, p[key]);
  if(v == null || v.trim()==='') return;
  const n = parseInt(v.replace(/[$,\s]/g,''), 10); if(isNaN(n)) return;
  p[key] = /^[+-]/.test(v.trim()) ? p[key] + n : n; render();
}

/* ---------- toss-up ---------- */
function startToss(){
  g.tossTimer = setInterval(()=>{
    if(g.paused) return;
    const left = hiddenTiles();
    if(!left.length){ stopTimers(); fx('sound','buzz'); status('Board is full and no one got it. Reveal All to move on.'); render(); return; }
    const i = left[Math.floor(Math.random()*left.length)];
    g.shown.push(i);
    fx('flip', {list:[[i, chAt(i)]], delay:0});
    render();
  }, Math.max(300, cfg.tossSpeed*1000));
}

/* ---------- bonus round ---------- */
function startBonus(){
  const free = [...new Set(cfg.bonusStart.toUpperCase().replace(/[^A-Z]/g,''))];
  g.used.push(...free);
  g.stage = 'pick';
  status(`${g.players[g.turn].name} plays for ${money(cfg.bonusPrize)}. Free letters are up. Pick ${cfg.bonusCons} consonant${cfg.bonusCons==1?'':'s'} and ${cfg.bonusVowels} vowel${cfg.bonusVowels==1?'':'s'}.`);
  fx('flip', {list: free.flatMap(L => positions(L).map(i=>[i,L])), gap:150});
}
function pickBonus(L){
  const vowel = VOWELS.includes(L);
  if(g.picks.includes(L)) g.picks = g.picks.filter(x=>x!==L);
  else {
    const have = g.picks.filter(x => VOWELS.includes(x) === vowel).length;
    if(have >= (vowel ? cfg.bonusVowels : cfg.bonusCons)) return status(`Already picked ${have} ${vowel?'vowel':'consonant'}${have==1?'':'s'}. Click one to swap it.`);
    g.picks.push(L);
  }
  render();
}
function revealPicks(){
  const list = g.picks.flatMap(L => positions(L).map(i=>[i,L]));
  g.used.push(...g.picks); g.picks = []; g.stage = 'ready';
  if(list.length) fx('flip', {list, gap:250}); else fx('sound','buzz');
  status(list.length ? 'Start the clock when ready.' : 'None of those are in it. Start the clock when ready.');
  render();
}
function startClock(){
  g.stage = 'clock'; g.clock = cfg.bonusClock; render();
  status(`${g.players[g.turn].name}, solve it! Click Solved! if right.`);
  g.clockTimer = setInterval(()=>{
    g.clock--; fx('sound', g.clock <= 3 ? 'clockLow' : 'clock');
    if(g.clock <= 0){ stopTimers(); g.stage='done'; fx('sound','buzz'); status("Time's up! Reveal All to show it."); }
    render();
  }, 1000);
}

/* ---------- wheel ---------- */
function openWheel(){
  if($('btnSpin').disabled) return;
  g.wheel = {open:true, who: g.mode==='speed' ? 'Speed-up spin' : g.players[g.turn].name + ' spins', val:'', hub:'Click<br>to spin'};
  render();
}
function closeWheel(){ g.wheel.open = false; }
function spin(){
  if(g.spinning || g.spun != null || !g.wheel.open) return;
  g.spinning = true; g.wheel.hub = ''; g.wheel.val = '';
  g.rot += 1440 + Math.random()*1080;
  fx('sound','spin'); render();
  setTimeout(landed, 5300);
}
function landed(){
  g.spinning = false;
  const n = wedges.length, a = ((360 - g.rot % 360) % 360);
  const w = wedges[Math.floor(a / (360/n)) % n];
  const p = g.players[g.turn];
  if(g.mode==='speed' && (w==='BUST' || w==='PASS')){   // speed-up only needs a value
    g.wheel.val = w; g.wheel.hub = 'Spin<br>again'; fx('sound','buzz'); return render(); }
  if(w==='BUST' || w==='PASS'){
    g.wheel.val = w; fx('sound','buzz'); if(w==='BUST') p.round = 0; render();
    setTimeout(()=>{ closeWheel(); nextTurn(w==='BUST' ? `${p.name} busts!` : `${p.name} loses the turn.`); }, 1800); return; }
  g.spun = parseInt(w,10) || 0;
  g.wheel.val = money(g.spun); fx('sound','ding');
  status(g.mode==='speed' ? `Every consonant is worth ${money(g.spun)}. ${p.name}, call a letter.` : `${p.name}, call a consonant for ${money(g.spun)}.`);
  render();
  setTimeout(()=>{ closeWheel(); render(); }, 1600);
}

/* ---------- setup ---------- */
const NUM_FIELDS = ['vowelPrice','tossPrize','tossSpeed','bonusPrize','bonusClock','bonusCons','bonusVowels'];
function openSetup(){
  $('title').value = cfg.title; $('topic').value = cfg.topic; $('hostSound').checked = cfg.hostSound;
  $('displayLink').textContent = $('displayLink').href = displayUrl();
  $('puzText').value = cfg.puzzles;
  $('numPlayers').value = cfg.numPlayers;
  NUM_FIELDS.forEach(k => $(k).value = cfg[k]);
  $('bonusStart').value = cfg.bonusStart;
  $('wedges').value = cfg.wedges;
  $('nameRow').innerHTML = cfg.names.map((n,i)=>`<input data-i="${i}" style="border-color:${PCOLORS[i]}">`).join('');
  $('nameRow').querySelectorAll('input').forEach(inp=>inp.value = cfg.names[inp.dataset.i]);
  $('puzErr').textContent = '';
  $('setup').classList.add('show');
}
function saveSetup(){
  const errs = parsePuzzles($('puzText').value).map((p,i)=>{ const r = layout(p.text); return typeof r==='string' ? `Line ${i+1}: ${r}` : null; }).filter(Boolean);
  if(errs.length){ $('puzErr').textContent = errs.join('\n'); return; }
  const wedgeList = $('wedges').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  if(wedgeList.length < 4 || wedgeList.some(w=>!/^\d+$/.test(w) && w!=='BUST' && w!=='PASS')){
    $('puzErr').textContent = 'Wedges must be numbers, BUST or PASS (at least 4).'; return; }
  const oldPuz = cfg.puzzles, oldN = cfg.numPlayers, oldTopic = cfg.topic;
  cfg.title = $('title').value.trim() || DEFAULTS.title;
  cfg.topic = fbKey($('topic').value.toUpperCase()) || oldTopic;
  cfg.hostSound = $('hostSound').checked;
  cfg.puzzles = $('puzText').value;
  cfg.numPlayers = +$('numPlayers').value;
  NUM_FIELDS.forEach(k => { const v = parseFloat($(k).value); cfg[k] = isNaN(v) || v < 0 ? DEFAULTS[k] : v; });
  cfg.bonusStart = $('bonusStart').value.toUpperCase().replace(/[^A-Z]/g,'');
  cfg.wedges = wedgeList.join(',');
  cfg.names = [...$('nameRow').querySelectorAll('input')].map((inp,i)=>inp.value.trim() || `Player ${i+1}`);
  store.set('wnf', cfg);
  if(cfg.topic !== oldTopic){ store.set('wnf-game', null); location.reload(); return; }
  if(oldN !== cfg.numPlayers || oldPuz !== cfg.puzzles){ stopTimers(); g = freshGame(); status('Setup saved. Load a puzzle to start.'); }
  else g.players.forEach((p,i)=>p.name = cfg.names[i]);
  $('setup').classList.remove('show'); render();
}

/* ---------- wiring ---------- */
$('btnDisplay').onclick = () => window.open(displayUrl(), 'wnf-display');
$('btnSetup').onclick = openSetup;
$('setupSave').onclick = saveSetup;
$('setupCancel').onclick = () => $('setup').classList.remove('show');
$('btnNew').onclick = () => { if(confirm('Start a new game? Scores reset and puzzles start from #1.')){ stopTimers(); g = freshGame(); status(''); render(); } };
$('btnLoad').onclick = () => loadPuzzle('normal');
$('btnToss').onclick = () => loadPuzzle('toss');
$('btnSpeed').onclick = () => loadPuzzle('speed');
$('btnBonus').onclick = () => {
  if(confirm(`Bonus round for ${g.players[g.turn].name}? (Click a player first to change who plays.)`)) loadPuzzle('bonus');
};
$('btnAction').onclick = () => {
  if(g.mode==='toss'){
    g.paused = !g.paused;
    if(!g.paused && !g.tossTimer) startToss();         // after a host refresh
    status(g.paused ? 'Paused.' : 'Letters filling in. Click a player when they buzz.'); render();
  }
  else if(g.stage==='pick') revealPicks();
  else if(g.stage==='ready') startClock();
};
$('btnSolve').onclick = solve;
$('btnReveal').onclick = () => { if(confirm('Reveal the puzzle without anyone banking?')) revealAll(); };
$('btnNext').onclick = () => nextTurn('');
$('btnSpin').onclick = openWheel;
$('wheel').onclick = spin;
$('wheelBack').onclick = () => { if(!g.spinning){ closeWheel(); render(); } };
$('value').onclick = () => {
  if(!g.grid || g.solved || g.mode==='toss' || g.mode==='bonus') return;
  const v = prompt('Set the spin value manually:', g.spun ?? ''); if(v==null) return;
  const n = parseInt(v.replace(/[$,]/g,''),10); g.spun = isNaN(n) ? null : n; render();
};
// keyboard: letters guess, space spins, 1-4 picks/buzzes a player
document.addEventListener('keydown', e=>{
  if(e.target.matches?.('input,textarea,select') || e.metaKey || e.ctrlKey) return;
  if($('setup').classList.contains('show')) return;
  if(g.wheel.open){ if(e.key===' '){ e.preventDefault(); spin(); } if(e.key==='Escape' && !g.spinning){ closeWheel(); render(); } return; }
  if(/^[a-z]$/i.test(e.key)) guess(e.key.toUpperCase());
  else if(/^[1-4]$/.test(e.key) && +e.key <= g.players.length) pickPlayer(+e.key - 1);
  else if(e.key===' '){ e.preventDefault(); openWheel(); }
});

// self-check: open index.html?test and look at the console
if(location.search.includes('test')){
  console.assert(layout('GARLIC FRIES WITH EXTRA PARMESAN').map(r=>r.trim()).join('|') === 'GARLIC FRIES|WITH EXTRA|PARMESAN|', 'wrap');
  console.assert(typeof layout('SUPERCALIFRAGILISTIC') === 'string', 'too long word');
  console.assert(typeof layout('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z A B C D E F') === 'string', 'too many rows');
  console.log('self-check done');
}
status(g.grid && !g.solved ? 'Game restored after a refresh.' : 'Pick a round on the right to load a puzzle. Click names or scores to edit.');
render();
}
