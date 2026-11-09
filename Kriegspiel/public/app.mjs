import { createReplay, formatFieldReport } from './field-report.mjs';
import {
  act, actor, advanceMF, advanceUnits, attackTactics, battleDraft, battleOdds, combatOddsLabel, combatResult, boardFor, boardOf, canUndoAction, cityProgress, createGame, defensive, deploymentHexes,
  enemy, layouts, lossCost, lossRules, name, oddsLabels, offensive, orientations, paths, pieces, playerView, quota,
  reinforcementHexes, reserve, retreatMF, retreatRules, setupPool, sides, specialHexes, strength,
  types, unitAt, unitsAt, withdrawalUnits, zone
} from './game.mjs';
import { computerAction } from './computer.mjs';
import { optionalSections, normalizeOptions, ruleErrors, months } from './options.mjs';
import { alternativeCRT } from './optional-charts.mjs';
import { campaignPanel, campaignControls, campaignMapMarkers } from './campaign-ui.mjs';
import { refreshStrike } from './campaign-ui.mjs';
import { vintageCards, mapsAvailable } from './distribution.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h = 100*Math.sqrt(3)/1.5;
const xOf = cell => cell.c*100;
const yOf = cell => cell.y*h/2;
const factions = { R:'red', B:'blue' };
const modes = { solo:'Solitaire', computer:'Vs computer', hot:'Hot-seat', lan:'LAN match' };
const appKey = 'kriegspiel-table-v1';
const controlsKey = 'kriegspiel-controls';
const rulesKey = 'kriegspiel-rule-defaults';
const aiPaces = { fast:180, watch:750, slow:1500 };
const buttons = (label,cmd,style='secondary',attrs='') => '<button type="button" class="'+style+'" data-do="'+cmd+'" '+attrs+'>'+label+'</button>';
const options = (values, current) => Object.entries(values).map(([id,label])=>'<option value="'+id+'" '+(current===id?'selected':'')+'>'+label+'</option>').join('');
const counter = unit => unit.type==='LOG'
  ? 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" rx="4" fill="'+(unit.side==='R'?'#9f2820':'#174d79')+'"/><text x="36" y="43" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="white" font-size="23">LOG</text></svg>')
  : '/assets/'+unit.id+(unit.reduced?'-reduced':'')+'.webp';
const unitLabel = u => name(u.side)+' '+u.n+'/'+u.corps+' · '+types[u.type]+(u.reduced?' · Reduced':'')+' · '+u.cf+' CF / '+u.mf+' MF';
const unitButtons = (units, picked=[], action='unit', eligible=null) => '<div class="unit-grid">'+units.map(u=>
  buttons('<img src="'+counter(u)+'" alt="">',action,'unit-button','data-unit="'+u.id+'" aria-pressed="'+picked.includes(u.id)+
    '" aria-label="'+unitLabel(u)+'" title="'+unitLabel(u)+'" '+attrDisabled(eligible && !eligible.has(u.id)))).join('')+'</div>';
const attrDisabled = flag => flag ? 'disabled' : '';
const terrainLabels = { clear:'Clear', river:'River', beach:'Beach', woods:'Woods', mountain:'Mountains', sea:'Sea', city:'City' };
const stage = { deploy:0,move:1,plan:2,nuclear:2,'nuclear-blast':2,intercept:2,'battle-support':2,'air-cap':2,surrender:2,'peace-response':2,'contact-review':2,'supply-retreat':2,'crt-route':3,'hold-ground':3,tactics:2,loss:3,'retreat-choice':3,retreat:3,withdraw:3,advance:3,'battle-review':3,over:3 };
const ruleTips = {
  deploy:[5,'§2 · Setup','Place starting divisions in their own nation. Full hexes along the board join open after deployment.'],
  move:[6,'§6 · Zones of control','Entering enemy ZOC stops movement. A unit must leave enemy ZOC before it can reenter.'],
  plan:[8,'§9.1 · Forced combat','Every engaged attacker and defender must be assigned once. Each attacker must border every defender in its battle, and the defenders must also border one another.'],
  tactics:[9,'Table 4 · Tactics','The rounded odds and both locked tactics determine losses. Only Game III solitaire rolls defensive tactics.'],
  loss:[10,'§9.3 · Losses','A4 and A6 are attacker losses. D4 is a defender loss. Meet at least the indicated CF.'],
  'retreat-choice':[10,'§9.4 · Retreats','The attacker decides whether all surviving defenders retreat and chooses each retreat route.'],
  retreat:[10,'§9.4 · Retreat routes','Retreat the full distance without crossing enemy ZOC, occupied hexes, prohibited terrain, or the map edge. No legal route eliminates a required retreating unit.'],
  withdraw:[10,'§9.4 · Withdrawal routes','The table variant uses the defense card’s distance and printed retreat path restrictions for optional attacker withdrawal.'],
  advance:[11,'§9.4 · Advances','Advance after retreats, stop on entering enemy ZOC, and respect stacking and terrain restrictions.']
};

function getLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveLocal(key,data) {
  try {
    if (data===null) localStorage.removeItem(key);
    else localStorage.setItem(key,JSON.stringify(data));
  } catch { /* A browser that blocks local storage can still play. */ }
}

let game = null;
let serverActor = null;
let lan = null;
let connected = false;
let addresses = [];
const coreRules = { setup:'free', terrain:false, retreatRule:'printed', lossRule:'whole', optional:{initiative:'random'} };
const savedRuleDefaults = getLocal(rulesKey);
let ruleDefaults = { ...coreRules,...savedRuleDefaults,optional:{...coreRules.optional,...savedRuleDefaults?.optional} };
let editingDefaults = false;
let choice = { mode:'solo', map:'color', layout:'standard',
  rotations:{R:'random',B:'random'}, human:'R',difficulty:'standard' };
let selected = null;
let special = false;
let attacks = [];
let defenses = [];
let losses = {};
let blocked = false;
let pending = false;
let showZone = false;
const trailScopes = { off:'Hidden',latest:'Latest route only',recent:'Latest route in each of the last two half-turns',half:'All routes this half-turn',both:'All routes this and the previous half-turn' };
const mapTones = { original:'Original', contrast:'High contrast', muted:'Muted', mono:'Grayscale' };
const difficulties = { recruit:'Recruit',standard:'Standard',veteran:'Veteran' };
const defaults = { showTrails:true,trailScope:'recent',aiPace:'watch',red:'#9d322c',blue:'#285878',mapTone:'original' };
let preferences = { ...defaults,...getLocal(controlsKey) };
let stackAt = null;
let undoPoint = null;
let lanUndo = false;
let sidebarPosition = '';
let zoom = 1;
let hit = null;
let routeOptions = {};
let targetIds = new Set();
let lastReadout = '';
let message = '';
let roomInput = (new URL(location.href).searchParams.get('room') ?? '').toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,6);
let logOpen = false;
let pollTimer;
let pollWarning = false;
let computerTimer;
let computerError = false;
let computerDeadlock = false;
let draft = null;

const find = (s,id) => s?.units.find(u => u.id===id);
const currentActor = () => lan ? serverActor : game && actor(game);
const computerActing = () => game?.mode==='computer' && currentActor()===enemy(game.human);
const interactive = () => game && !blocked && !computerActing() && (!lan || lan.side===serverActor) && game.phase!=='over';
const canUndo = () => !!game && !blocked && !computerActing() && (lan ? lanUndo : !!undoPoint);
const publicState = () => !game ? null : lan ? game : playerView(game,game.mode==='computer'?game.human:currentActor());
const previewBoard = () => boardFor(choice.map,choice.layout,choice.rotations);
const tooltip = ([page,label,description]) => '<div class="rule-anchor">'+buttons(label,'rule','rule-link','data-page="'+page+'" aria-describedby="phase-tip"')+
  '<span id="phase-tip" role="tooltip">'+description+'</span></div>';
const capital = u => u.cap ? ' · '+name(u.cap)+' capital' : '';
const phaseHead = (tag, title, desc='', side) => '<p class="eyebrow '+(factions[side] ?? '')+'">'+tag+'</p><h2>'+title+'</h2>'+(desc?'<p>'+desc+'</p>':'');
const actionRow = (...items) => '<div class="action-row">'+items.join('')+'</div>';
const strengthCards = s => sides.map(side => {
  const hidden = !s || ['map-choice','deploy'].includes(s.phase);
  const cities = s && !hidden && cityProgress(s,side);
  return '<div class="score '+factions[side]+'"><small>'+name(side).toUpperCase()+'</small><span><strong>'+
    (hidden?'—':strength(s,side))+'</strong> CF on map</span>'+
    (cities?'<span class="city-score" title="'+cities.occupied+' occupied. A city is secured after it survives the opposing half-turn.">'+cities.secured+'/'+cities.total+' enemy cities secured</span>':'')+'</div>';
}).join('');

function renderSetup() {
  const desc = { solo:'Command both sides · weighted defense rolls', computer:'Play one faction · local opponent',
    hot:'Two players · one shared screen', lan:'Two browsers · the same network' };
  const join = '<form class="join" id="join"><label>JOIN A LAN ROOM<span class="join-row"><input id="room-code" maxlength="6" placeholder="ROOM CODE" value="'+roomInput+'" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Six-character room code" required pattern="[A-Fa-f0-9]{6}"><button class="secondary" '+attrDisabled(pending)+'>Join</button></span></label></form>';
  return (roomInput ? join : '')+phaseHead('NEW ENGAGEMENT','Set up a battle','Choose how to play, then assemble the field.')+
    '<div class="mode-options">'+Object.entries(modes).map(([id,label],i)=>
      '<button class="mode-choice" data-do="mode" data-mode="'+id+'" aria-pressed="'+(choice.mode===id)+'"><span class="num">0'+(i+1)+'</span><span><b>'+label+'</b><small>'+desc[id]+'</small></span><span class="arrow" aria-hidden="true">'+(choice.mode===id?'◆':'›')+'</span></button>').join('')+'</div>'+
    '<div class="fields"><label>MAP SET<select id="map-choice">'+options(mapsAvailable,choice.map)+'</select></label>'+
    '<label>MAP JOIN<select id="layout-choice">'+options(layouts,choice.layout)+'</select></label>'+
    '<label>RED BOARD<select id="rotate-red">'+options(orientations,choice.rotations.R)+'</select></label>'+
    '<label>BLUE BOARD<select id="rotate-blue">'+options(orientations,choice.rotations.B)+'</select></label></div>'+
    buttons('Review rules &amp; start','game-rules','primary wide',attrDisabled(pending))+
    (roomInput?'':join);
}

function invite() {
  if (!lan || connected || lan.side!=='R') return '';
  const origin = addresses.includes(location.origin) ? location.origin : addresses[0] ?? location.origin;
  const url = origin+'/?room='+lan.code;
  return '<section class="invite"><strong>'+lan.code+'</strong><p>Share this invite with Blue on your network.</p><input readonly id="invite-url" value="'+esc(url)+'" aria-label="LAN invite link">'+
    buttons('Copy invite','copy-invite','text-button')+'</section>';
}

function infoCard(u, board) {
  const cell = u.pos && board.cells[u.pos];
  const mf = (u.mf*3-u.spent)/3;
  const remaining = Math.floor(mf)+(mf%1>.6?'⅔':mf%1>.3?'⅓':'');
  return '<div class="unit-card"><img src="'+counter(u)+'" alt=""><div><strong>'+types[u.type]+' · '+u.n+'/'+u.corps+'</strong><small>'+
    (cell?cell.label+' · '+u.cf+' CF · '+(u.stopped?'Movement stopped':remaining+' MF left'):'Reserve · '+u.cf+' CF / '+u.mf+' MF')+'</small></div></div>';
}

function combatChart(b, compact = false, alternate = b?.odds.alternate) {
  const groups = alternate ? alternativeCRT : oddsLabels.map(odds=>({odds,tactics:[0,1,2]}));
  const indices = compact ? [b.odds.index] : groups.map((_,i)=>i);
  const shown = b?.outcome!=null;
  const heads = indices.map(i=>'<th colspan="'+groups[i].tactics.length+'" scope="colgroup"'+(i===b?.odds.index?' class="current-odds"':'')+'>'+groups[i].odds+'</th>').join('');
  const subheads = indices.map(i=>groups[i].tactics.map(a=>'<th scope="col" title="'+offensive[a]+'">'+['Hold','Assault','Blitz','Engage','Assault'][a]+'</th>').join('')).join('');
  const rows = defensive.map((label,d)=>'<tr><th scope="row">'+label+'</th>'+indices.map(i=>groups[i].tactics.map(a=>{
    const result = combatResult({odds:{index:i,alternate}},a,d);
    const revealed = shown && i===b.odds.index && a===b.off && d===b.def;
    return '<td'+(revealed?' class="chart-result"':'')+'>'+((result || '—').replaceAll(' ',' · '))+'</td>';
  }).join('')).join('')+'</tr>').join('');
  return '<div class="crt-scroll '+(compact?'compact-chart':'full-chart')+'"'+(compact?'':' tabindex="0"')+'><table aria-label="'+(compact?'Current odds combat chart':'Full combat chart')+
    '"><thead><tr><th scope="col">Attack odds</th>'+heads+'</tr><tr><th scope="col">Defense</th>'+subheads+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function combatSummary(s,b,includeChart = true) {
  const number = b.number ?? 1;
  const count = '<p class="battle-progress">'+name(s.active)+' attacking · Battle '+number+' of '+(number+s.battles.length)+'</p>';
  return '<div class="battle-summary"><span>'+b.odds.attack+' CF ATK</span><b>'+combatOddsLabel(b)+'</b><span>'+b.odds.defend+' CF DEF</span></div>'+
    count+'<div class="hint">'+b.a.join(', ')+' → '+b.d.join(', ')+'</div>'+
    (b.outcome===null?'':'<p><strong>'+(b.outcome || 'No casualties')+'</strong>'+((offensive[b.off]&&defensive[b.def])?' · '+offensive[b.off]+' / '+defensive[b.def]:'')+(b.roll?' · d6 '+b.roll:'')+'</p>')+
    (includeChart?combatChart(b,true):'');
}

function lossOrders(s,item) {
  const units = item.ids.map(id=>find(s,id)).filter(u=>u.pos);
  if (s.lossRule==='whole') return unitButtons(units,Object.keys(losses),'loss-unit');
  return '<div class="loss-orders">'+units.map(u=>{
    const step = lossCost(s,u,'reduce');
    const entries = { keep:'Keep division' };
    if (step || item.stepOnly&&!u.reduced) entries.reduce = 'Reduce · −'+step+' CF';
    if (!item.stepOnly || u.reduced) entries.eliminate = 'Eliminate · −'+u.cf+' CF';
    return '<label class="loss-order"><img src="'+counter(u)+'" alt=""><span><b>'+u.id+' · '+u.cf+' CF</b><select aria-label="Loss for '+u.id+
      '" data-loss="'+u.id+'">'+options(entries,losses[u.id] ?? 'keep')+'</select></span></label>';
  }).join('')+'</div>';
}

function command(s, who, enabled) {
  if (!s) return renderSetup();
  if (blocked) return phaseHead('HOT-SEAT','Pass the screen','The next decision is private.');
  const board = boardOf(s), u = find(s,selected);
  if (s.phase==='over') return phaseHead('ENGAGEMENT COMPLETE',s.winner==='draw'?'Draw':name(s.winner)+' wins',s.reason)+actionRow(buttons('View field report','view-report'),buttons('New table','new','primary'));
  const turn = s.turn ? 'TURN '+s.turn+' / '+(s.half===0?'FIRST':'SECOND')+' HALF' : 'INITIAL DEPLOYMENT';
  const top = invite();
  if (!enabled) {
    const phase = s.phase==='deploy' ? 'deploy their divisions' : s.phase==='tactics' ? 'lock their tactic' : 'finish their orders';
    const activities = { move:'movement',plan:'combat planning',tactics:'tactics',loss:'casualty selection',
      retreat:'retreat',withdraw:'withdrawal',advance:'post-combat advance','battle-review':'battle review',deploy:'deployment' };
    return top+phaseHead(turn,name(who)+' '+(activities[s.phase] ?? 'orders'),'You are playing '+name(lan?.side ?? s.human)+'.',who)+
      (s.battle ? combatSummary(s,s.battle) : '')+
      (s.phase==='plan'?'<div class="waiting"><p>Movement is locked. '+name(who)+' is assigning engagements before combat.</p></div>':
        '<div class="waiting"><p>Waiting for '+(s.mode==='computer'?'the computer':name(who))+' to '+phase+'.</p></div>')+
      (s.mode==='computer' && computerDeadlock?'<p>The computer inherited an engagement that has no complete legal grouping. The table ruling resolves as many contacts as possible and logs the exemptions.</p>'+
        buttons('Authorize deadlock ruling','authorize-deadlock','primary'):'');
  }
  const advanced = campaignPanel(s,who);
  if (advanced!==null) return top+advanced;
  if (s.phase==='deploy') {
    const explicit = s.mode!=='solo'||s.optional?.deployChallenge;
    const reviewing = !explicit && s.soloDeployReview;
    const done = pieces(s,who).length;
    const max = quota(s,who);
    return top+phaseHead(turn,name(who)+' deployment',reviewing?'Both sides are deployed. Adjust either roster or lock the deployment.':!explicit?'Place one division. A coin flip decides which side places next. Select a placed division to reposition it.':'Select a roster division or a placed division, then choose a legal hex.',who)+
      '<div class="faction-line '+factions[who]+'"><span class="faction-label">'+name(who).toUpperCase()+'</span><strong>'+done+' / '+max+'</strong></div>'+
      '<div class="progress '+factions[who]+'"><i style="width:'+done/max*100+'%"></i></div>'+
      (done<max?unitButtons(setupPool(s,who).filter(p=>!p.pos),u?[u.id]:[]):'<p>Deployment is ready.</p>')+
      (u?.pos&&explicit?buttons('Return '+u.id+' to roster','undeploy'):'')+
      (reviewing?buttons('Edit '+name(enemy(who))+' deployment','select-deploy-side'):'')+
      ((explicit?done:pieces(s).length)?buttons('Recall all deployed divisions','recall-deployment'):'')+
      actionRow(buttons(!explicit?'Quick deploy both sides':'Quick deploy',explicit?'auto-deploy':'preview-deploy','secondary',attrDisabled(reviewing||explicit&&done===max)),
        explicit||reviewing?buttons('Lock deployment','deploy-ready','primary',attrDisabled(done!==max || (lan&&!connected))):'');
  }
  if (s.phase==='move') {
    const canSpecial = u?.pos && Object.keys(specialHexes(s,u)).length;
    const available = reserve(s,who);
    const ready = s.credit[who] && available.some(r=>reinforcementHexes(s,who,r).length);
    return phaseHead(turn,name(who)+' movement','Select a division on the map, then choose a highlighted destination.',who)+
      (u ? infoCard(u,board) : '<div class="waiting"><p>Awaiting movement orders.</p></div>')+
      (canSpecial?buttons(special?'Return to ground movement':u.type==='ABI'?'Set parachute drop':'Launch invasion','special-mode'):'')+
      (s.credit[who]?'<h3>Reinforcements · '+s.credit[who]+'</h3>'+(ready?unitButtons(available,u?[u.id]:[]):'<p>Capital entry is blocked. Reinforcements wait in reserve.</p>'):'')+
      (s.resettableMoves?.includes(u?.id)?buttons('Reset '+u.id+' movement','reset-unit-move'):'')+
      actionRow(buttons('Reset all moves','confirm-reset-move'),buttons('End movement','end-move','primary'))+
      (s.inheritedDeadlock?'<details class="deadlock"><summary>Inherited engagement deadlock</summary><p>Try repositioning first. If a complete legal plan remains impossible, this ruling keeps the largest set of legal engagements and reports any exemptions.</p>'+
        buttons('Resolve remaining contacts','resolve-deadlock')+'</details>':'');
  }
  if (s.phase==='plan') {
    const a = draft.attackers.map(id=>find(s,id));
    const d = draft.defenders.map(id=>find(s,id));
    const odds = draft.complete ? battleOdds(s,attacks,defenses) : null;
    return phaseHead(turn,'Assign battles','Every selected attacker must border every target. The defending hexes must also border one another.',who)+
      (s.combatExempt?.length?'<p>Deadlock exemptions · '+s.combatExempt.join(', ')+'</p>':'')+
      (a.length?'<h3>Attacking divisions</h3>'+unitButtons(a,attacks,'battle-unit',draft.eligible):'')+
      (d.length?'<h3>Defending divisions</h3>'+unitButtons(d,defenses,'battle-unit',draft.eligible):'')+
      (odds?'<div class="battle-summary"><span>'+odds.attack+' CF ATK</span><b>'+combatOddsLabel({odds})+'</b><span>'+odds.defend+' CF DEF</span></div>':'')+
      (odds&&!draft.legal?'<p>This grouping would leave another required engagement without a legal assignment.</p>':'')+
      (a.length||d.length?actionRow(buttons('Add battle','add-battle','secondary',attrDisabled(!draft.legal)),
        buttons('Suggest remaining','auto-plan'),
        attacks.length||defenses.length?buttons('Clear selection','clear-draft','text-button'):''):'')+
      (s.battles.length?'<h3>Battle order</h3><ol class="battle-list">'+s.battles.map((g,i)=>'<li><div class="planned-row"><span>'+g.a.join(', ')+' → '+g.d.join(', ')+'</span>'+
        buttons('Remove','remove-battle','text-button','data-index="'+i+'" aria-label="Remove battle '+(i+1)+'"')+'</div></li>').join('')+'</ol>':'')+
      actionRow(buttons('Clear plan','clear-plan','secondary',attrDisabled(!s.battles.length)),
        buttons('Resolve battles','start-battles','primary',attrDisabled(a.length||d.length)));
  }
  const b = s.battle;
  if (s.phase==='tactics') {
    const defend = b.locked;
    const list = defend ? [0,1,2,3] : attackTactics(b);
    const showChart = matchMedia('(min-width: 691px) and (min-height: 690px)').matches;
    return phaseHead(turn,defend?'Choose a defense':'Choose an attack','',who)+combatSummary(s,b,false)+
      '<div class="orders tactic-orders" role="group" aria-label="'+name(who)+' tactics">'+list.map(i=>
        buttons((defend&&i<3&&vintageCards?'<img src="/assets/defense-'+i+'.webp" alt="">':'<span class="glyph" aria-hidden="true">'+(defend?['↶','←','⊥','◆'][i]:['⊥','↑','⇈','⊥','↑'][i])+'</span>')+
          '<span><b>'+(defend?defensive[i]:offensive[i])+'</b><small>'+(b.odds.alternate?'Use chart result':defend?(retreatMF[i]?'Retreat '+retreatMF[i]+' MF':'Hold position'):(advanceMF[i]?'Advance up to '+advanceMF[i]+' MF':'No advance'))+'</small></span>',
        'tactic','order','data-choice="'+i+'"')).join('')+'</div>'+
      (s.mode==='solo'?actionRow(buttons('Roll offensive tactic','roll')):'')+
      '<div class="tactic-reference-wrap"><details class="tactic-reference" '+(showChart?'open':'')+
      '><summary>Current odds chart · '+combatOddsLabel(b)+'</summary>'+combatChart(b,true)+'</details>'+tooltip(ruleTips.tactics)+'</div>';
  }
  const summary = combatSummary(s,b);
  if (s.phase==='loss') {
    const item = b.losses[0];
    const total = Object.entries(losses).reduce((sum,[id,kind])=>sum+lossCost(s,find(s,id),kind),0);
    const desc = s.lossRule!=='whole'?'Reduce or eliminate participating divisions totaling at least ':'Remove whole participating divisions totaling at least ';
    return phaseHead(turn,'Assign '+name(who)+' losses',item.stepOnly?'Choose one step from a participating division.':desc+item.minimum+' CF.',who)+summary+
      lossOrders(s,item)+buttons(item.stepOnly?'Apply step loss':'Apply '+total+' CF loss','take-loss','primary wide',attrDisabled(total<item.minimum || item.stepOnly&&Object.keys(losses).length!==1));
  }
  if (s.phase==='retreat-choice') return phaseHead(turn,'Order a retreat','You may leave the defenders in place or order a '+retreatMF[b.def]+' MF retreat.',who)+summary+
    actionRow(buttons('Leave in place','hold-defenders'),buttons('Order retreat','order-retreat','primary'));
  if (s.phase==='retreat') return phaseHead(turn,name(who)+' directs the retreat','Select a defending division and choose a legal destination for its full '+retreatMF[b.def]+' MF retreat.',who)+
    unitButtons(b.retreat.map(id=>find(s,id)),u?[u.id]:[])+
    (u && !targetIds.size?'<p>No legal route. The division must be eliminated.</p>'+buttons('Remove trapped division','retreat-trapped','danger'):'')+summary;
  if (s.phase==='withdraw') return phaseHead(turn,'Attacker withdrawal','You may withdraw any highlighted attacker the full '+retreatMF[b.def]+' MF. A withdrawn division gives up its advance.',who)+summary+
    unitButtons(withdrawalUnits(s),u?[u.id]:[])+buttons('Finish withdrawals and check advances','end-withdraw','primary wide');
  if (s.phase==='advance') return phaseHead(turn,'Advance attackers','Select a surviving attacker and choose a highlighted destination up to '+advanceMF[b.off]+' MF away.',who)+
    unitButtons(advanceUnits(s),u?[u.id]:[])+buttons('Finish or skip advances','end-battle','secondary wide')+summary;
  if (s.phase==='battle-review') return phaseHead(turn,'Battle complete',s.battles.length?
    'There '+(s.battles.length===1?'is 1 battle':'are '+s.battles.length+' battles')+' left in this half-turn.':'All battles in this half-turn have been resolved.',who)+
    (b.advanceNote?'<p class="waiting">'+b.advanceNote+'</p>':'')+summary+
    buttons(s.battles.length?'Next battle':'End '+name(s.active)+' half-turn','continue-battle','primary wide');
  return '';
}
function availableHexes(s,u) {
  if (!s || !u || !interactive()) return {};
  if (s.phase==='deploy' && u.side===currentActor()) return Object.fromEntries(deploymentHexes(s,u).map(id=>[id,{}]));
  if (s.phase==='move') {
    if (!u.pos) return Object.fromEntries(reinforcementHexes(s,u.side,u).map(id=>[id,{}]));
    if (special) return Object.fromEntries(Object.keys(specialHexes(s,u)).map(id=>[id,{}]));
    return paths(s,u);
  }
  if (s.phase==='retreat' || s.phase==='withdraw') return paths(s,u,'retreat',retreatMF[s.battle.def]-Number(s.phase==='retreat'&&!!s.battle.holding?.includes(u.id)));
  if (s.phase==='advance') return paths(s,u,'advance',advanceMF[s.battle.off]);
  return {};
}

const unitSize = 74;
const corners = [[-100/1.5,0],[-100/3,-h/2],[100/3,-h/2],[100/1.5,0],[100/3,h/2],[-100/3,h/2]];
const polygon = cell => corners.map(([x,y])=>(x+xOf(cell))+','+(y+yOf(cell))).join(' ');

function movementTrails(s,board) {
  if (!s || blocked || !preferences.showTrails || preferences.trailScope==='off') return '';
  const current = s.trails?.at(-1);
  const routes = ({
    latest:[current], recent:[s.lastTrails?.at(-1),current],
    half:s.trails ?? [], both:[...(s.lastTrails ?? []),...(s.trails ?? [])]
  }[preferences.trailScope] ?? []).filter(Boolean);
  if (!routes.length) return '';
  const markers = sides.map(side=>'<marker id="trail-'+side+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10L2 5Z" class="trail-tip '+factions[side]+'"/></marker>').join('');
  const lines = routes.map(route=>{
    const {side,path,kind} = route;
    const cells = path.map(id=>board.cells[id]).filter(Boolean);
    if (cells.length<2) return '';
    const points = cells.map(cell=>[xOf(cell),yOf(cell)]);
    const last = points.at(-1), before = points.at(-2);
    const length = Math.hypot(last[0]-before[0],last[1]-before[1]);
    if (!length) return '';
    points[points.length-1] = last.map((v,k)=>v-(v-before[k])*Math.min(42,length/2)/length);
    const latest = route===current;
    return '<polyline class="movement-trail '+factions[side]+(latest?' latest':'')+
      (kind==='move'?'':' transport')+'" marker-end="url(#trail-'+side+')" points="'+points.map(p=>p.join(',')).join(' ')+'"/>';
  }).join('');
  return '<defs>'+markers+'</defs><g aria-hidden="true" pointer-events="none">'+lines+'</g>';
}

function drawBoard(s,board,preview=null) {
  const viewing = !!preview;
  const hidden = !viewing && blocked;
  const units = Object.groupBy(s && !hidden ? pieces(s) : [],u=>u.pos);
  const active = s && !hidden;
  const r = active && !viewing && showZone ? zone(s,'R') : new Set();
  const b = active && !viewing && showZone ? zone(s,'B') : new Set();
  const needed = new Set(!viewing&&draft ? [...draft.attackers,...draft.defenders] : []);
  const inBattle = new Set(active&&s.battle?[...s.battle.a,...s.battle.d]:[]);
  const planned = new Set(active?s.battles.flatMap(g=>[...g.a,...g.d]):[]);
  const picks = new Set(viewing?[preview.entry?.action.unit]:[selected,...attacks,...defenses,...Object.keys(losses)]);
  if (!viewing && !board.cells[hit]) hit = Object.keys(board.cells)[0];
  const maps = board.halves.map(half => {
    const width = 1000;
    const height = board.rows*h/(board.cols===10?2:1);
    const x = half.x*100, y = half.row*h;
    const rotate = half.rotate ? ' transform="rotate(180 '+(x+width/2)+' '+(y+height/2)+')"' : '';
    return '<image class="map-art" href="/assets/'+half.asset+'.webp" x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" preserveAspectRatio="none"'+rotate+'/>';
  }).join('');
  const tiles = Object.values(board.cells).map(cell=>{
    const stack = units[cell.id] ?? [];
    const u = stack.find(v=>v.id===(viewing?preview.entry?.action.unit:selected)) ?? stack.find(v=>v.type!=='LOG') ?? stack[0], id = u?.id;
    const marks = active ? campaignMapMarkers(s,cell.id) : [];
    const legal = !viewing && targetIds.has(cell.id);
    const used = planned.has(id);
    const unavailable = !viewing && draft && u && !stack.some(v=>draft.eligible.has(v.id));
    const cls = ['hex',u?'has-unit':'',legal?'legal actionable':'',legal&&special?'special':'',picks.has(id)?'selected':'',
      r.has(cell.id)?'zr':'',b.has(cell.id)?'zb':'',inBattle.has(id)?'in-battle':'',used?'planned assigned':'',
      needed.has(id)?'engaged':'',unavailable?'unavailable':''].join(' ');
    const x = xOf(cell), y = yOf(cell);
    const label = esc(cell.label+', '+terrainLabels[cell.terrain]+capital(cell)+(u?', '+stack.map(unitLabel).join(', '):'')+
      (marks.length?', '+marks.join(', '):'')+(legal?', legal destination':''));
    const attributes = viewing?'':'data-hex="'+cell.id+'" role="button" '+(unavailable?'aria-disabled="true" ':'')+
      'tabindex="'+(hit===cell.id&&!hidden?0:-1)+'" aria-label="'+label+'"';
    return '<g class="'+cls+'" '+attributes+'>'+(viewing&&u?'<title>'+label+'</title>':'')+
      '<polygon class="tile" points="'+polygon(cell)+'"/>'+
      (marks.length?'<text class="campaign-map-mark" x="'+x+'" y="'+(y+51)+'">'+marks.join(' ')+'</text>':'')+
      (stack.length>1?'<rect class="stack-edge" x="'+(x-unitSize/2+5)+'" y="'+(y-unitSize/2-5)+'" width="'+unitSize+'" height="'+unitSize+'"/>':'')+
      (u?'<image class="counter" href="'+counter(u)+'" x="'+(x-unitSize/2)+'" y="'+(y-unitSize/2)+'" width="'+unitSize+'" height="'+unitSize+'"/>'+
        (stack.length>1?'<text class="stack-count" x="'+(x+31)+'" y="'+(y-26)+'">'+stack.length+'</text>':'')+
        (u.landing?'<circle class="badge" cx="'+(x+35)+'" cy="'+(y-34)+'" r="11" fill="#f9d276"/>':''):
        legal?'<circle class="center-pip" cx="'+x+'" cy="'+y+'" r="7"/>':'')+'</g>';
  }).join('');
  const route = preview?.route?.path.map(id=>board.cells[id]).filter(Boolean);
  const trace = route?.length>1?'<polyline class="replay-route" points="'+route.map(cell=>xOf(cell)+','+yOf(cell)).join(' ')+'"/>':'';
  $(viewing?'replay-board':'board').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(board.cols*100)+' '+(board.rows*h)+'" aria-label="Kriegspiel map">'+maps+
    (board.cols===20?'<path d="M1000 0V'+board.rows*h+'" stroke="#827552" stroke-width="2" stroke-dasharray="9 8" opacity=".7"/>':
      '<path d="M0 '+board.rows*h/2+'H1000" stroke="#827552" stroke-width="2" stroke-dasharray="9 8" opacity=".7"/>')+
    (viewing?trace:movementTrails(s,board))+tiles+(viewing?'':'<polyline id="route" class="route" points=""/>')+'</svg>';
}

function fitBoard() {
  const {cols,rows} = game ? boardOf(game) : previewBoard();
  const view = $('viewport');
  const width = Math.floor(Math.min(view.clientWidth-22,(view.clientHeight-22)*cols*100/(rows*h)));
  $('board').style.width = Math.max(100,Math.round(width*zoom))+'px';
  $('zoom-level').textContent = zoom===1?'FIT':Math.round(zoom*100)+'%';
}

function zoomBoard(scale, x, y) {
  if (blocked) return;
  const viewport = $('viewport');
  const bounds = viewport.getBoundingClientRect();
  const before = $('board').getBoundingClientRect();
  x ??= bounds.left + viewport.clientWidth / 2;
  y ??= bounds.top + viewport.clientHeight / 2;
  const next = Math.max(.85,Math.min(6,scale));
  if (zoom===next || !before.width) return;
  zoom = next;
  fitBoard();
  const after = $('board').getBoundingClientRect();
  const ratio = after.width/before.width;
  viewport.scrollLeft += after.left+(x-before.left)*ratio-x;
  viewport.scrollTop += after.top+(y-before.top)*ratio-y;
}

function render() {
  const who = currentActor();
  const s = publicState();
  document.body.classList.toggle('lobby', !s);
  const table = $('table');
  const viewport = $('viewport');
  const left = viewport.scrollLeft, top = viewport.scrollTop;
  const tactics = s?.phase==='tactics';
  table.classList.toggle('tactics-layout',tactics);
  const board = s ? boardOf(s) : previewBoard();
  draft = s?.phase==='plan' && interactive() ? battleDraft(s,attacks,defenses) : null;
  routeOptions = availableHexes(s,find(s,selected));
  targetIds = new Set(Object.keys(routeOptions));
  $('scoreboard').innerHTML = strengthCards(blocked?null:s);
  $('map-name').textContent = mapsAvailable[s?.map ?? choice.map] ?? mapsAvailable.classic;
  const orientation = board.halves.map(half => half.side+' '+(!s && choice.rotations[half.side]==='random'?'?':half.rotate?'180°':'0°')).join(' / ');
  $('map-status').textContent = ((layouts[s?.layout ?? choice.layout] ?? layouts.standard)+' · '+orientation+' · '+
    (s?.terrain??ruleDefaults.terrain?'TERRAIN ON':'FLAT MF')+(s?.month?' · '+months[s.month-1]+' / '+s.weather:'')).toUpperCase();
  $('mode').textContent = lan ? 'LAN / '+lan.code : s ? modes[s.mode].toUpperCase() : 'LOCAL TABLE';
  $('phase-track').innerHTML = ['DEPLOY','MOVE','COMBAT','RESOLVE'].map((label,i)=>
    '<span class="'+((stage[s?.phase]??0)===i?'live':'')+'"><b>0'+(i+1)+'</b> '+label+'</span>').join('');
  $('zoc').setAttribute('aria-pressed',String(showZone));
  const trailOn = preferences.showTrails && preferences.trailScope!=='off';
  $('trails').setAttribute('aria-pressed',String(trailOn));
  document.documentElement.style.setProperty('--red',preferences.red);
  document.documentElement.style.setProperty('--blue',preferences.blue);
  table.dataset.mapTone = preferences.mapTone;
  $('ai-pace-control').hidden = (s?.mode ?? choice.mode)!=='computer';
  $('ai-pace').value = preferences.aiPace;
  $('undo').disabled = !canUndo();
  drawBoard(s,board);
  fitBoard();
  viewport.scrollLeft = left;
  viewport.scrollTop = top;
  $('veil').hidden = !blocked;
  viewport.inert = blocked;
  document.querySelector('.map-tools').inert = blocked;
  viewport.parentElement.classList.toggle('covered',blocked);
  if (blocked) $('handoff-title').textContent = name(who)+' command';
  const sidebar = $('command-body');
  const position = [s?.phase,s?.turn,s?.half,s?.battle?.number,who,blocked].join('/');
  const changed = position!==sidebarPosition;
  const choosing = tactics && interactive();
  const scroll = changed ? 0 : sidebar.scrollTop;
  sidebar.classList.toggle('choosing-tactic',choosing);
  sidebarPosition = position;
  const rule = !blocked && !choosing && ruleTips[s?.phase];
  const enabled = interactive();
  const stack = enabled&&stackAt ? unitsAt(s,stackAt) : [];
  sidebar.innerHTML = (rule ? tooltip(rule) : '')+(stack.length>1
    ? '<h3>Divisions in '+esc(board.cells[stackAt].label)+'</h3>'+unitButtons(stack,selected?[selected]:[],'unit',draft?.eligible)
    : '')+command(s,who,enabled)+(enabled?campaignControls(s,who,selected):'');
  sidebar.scrollTop = scroll;
  $('notice').hidden = !message;
  $('notice').textContent = message;
  const log = $('battle-log');
  log.hidden = blocked || !s?.log.length;
  log.innerHTML = '<details '+(logOpen&&!choosing?'open':'')+'><summary>FIELD REPORT'+(s?.log[0]?' · '+esc(s.log[0].slice(0,34)):'')+'</summary><ul>'+
    (s?.log ?? []).map(entry=>'<li>'+esc(entry)+'</li>').join('')+'</ul></details>';
  log.querySelector('details').addEventListener('toggle',e=>{logOpen=e.target.open;});
  const trail = trailOn && s?.trails?.at(-1);
  const latest = trail && board.cells[trail.path[0]]?.label && board.cells[trail.path.at(-1)]?.label;
  const route = latest ? trail.unit+' '+trail.kind+' · '+board.cells[trail.path[0]].label+' → '+latest : '';
  $('hex-readout').textContent = blocked?'Awaiting handoff':lastReadout || route || (s?'Select a division to highlight legal destinations.':'Point to a hex to read its terrain.');
  if (changed && blocked) $('veil').querySelector('button').scrollIntoView({block:'nearest'});
  else if (changed && choosing) table.scrollIntoView({block:'nearest'});
  scheduleComputer();
}

function setNotice(text) {
  message = text;
  $('notice').textContent = text;
  $('notice').hidden = !text;
}

function clearChoices(keep = false) {
  stackAt = null;
  if (!keep) selected = null;
  special = false;
  attacks = [];
  defenses = [];
  losses = {};
  lastReadout = '';
}

function persist() {
  if (lan) saveLocal(appKey,{lan});
  else if (game) saveLocal(appKey,{game,blocked,undoPoint});
  else saveLocal(appKey,null);
}

function applySnapshot(data, keep = false) {
  const previous = game;
  game = data.game;
  connected = data.connected;
  serverActor = data.actor;
  lanUndo = data.canUndo===true;
  if (!keep || previous?.phase!==game.phase) clearChoices();
  render();
}

async function api(path,data,key) {
  const response = await fetch('/api'+path,{
    method:data===undefined?'GET':'POST',
    headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(key?{Authorization:'Bearer '+key}:{})},
    body:data===undefined?undefined:JSON.stringify(data)
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || 'Could not reach the host.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function poll() {
  const seat = lan;
  if (!seat || pending) return;
  try {
    const data = await api('/rooms/'+seat.code,undefined,seat.key);
    if (lan!==seat || pending || (game && data.game.rev<game.rev)) return;
    if (pollWarning) { message = ''; pollWarning = false; }
    if (!game || data.game.rev!==game.rev || connected!==data.connected) applySnapshot(data);
    else setNotice(message);
  } catch(error) {
    if (lan!==seat) return;
    pollWarning = true;
    setNotice(error.status===404?'The room has closed. Start a new table to reconnect.':'Waiting to reconnect to the LAN host…');
  }
}

function openSeat(data) {
  lan = { code:data.code, key:data.key, side:data.side };
  saveLocal(appKey+'/'+lan.code,lan);
  persist();
  applySnapshot(data);
  clearInterval(pollTimer);
  pollTimer = setInterval(poll,1050);
}

async function dispatch(action, automated = false) {
  const undoing = action.type==='undo';
  if (pending || (undoing ? !canUndo() : automated ? !computerActing() : !interactive())) return;
  const old = currentActor();
  const phase = game.phase;
  const keep = action.type==='move';
  setNotice('');
  try {
    if (lan) {
      pending = true;
      const seat = lan;
      const data = await api('/rooms/'+seat.code,{rev:game.rev,action},seat.key);
      if (lan===seat) applySnapshot(data,keep);
    } else {
      const before = game;
      const next = undoing ? { ...undoPoint, rev:before.rev+1 } : structuredClone(before);
      if (!undoing) act(next,old,action);
      undoPoint = !automated && !undoing && canUndoAction(before,next,action,old) ? before : null;
      game = next;
      if (game.mode==='hot' && currentActor() && old!==currentActor()) blocked = true;
      clearChoices(keep && phase===game.phase && old===currentActor());
      persist();
      render();
    }
    if (blocked) $('veil').querySelector('button').focus({preventScroll:true});
  } catch(error) {
    if (lan && error.payload?.game && error.payload.game.rev>=game.rev) applySnapshot(error.payload);
    if (automated) computerError = true;
    setNotice((automated?'Computer paused. ':'')+error.message);
  } finally { pending = false; }
}

function scheduleComputer() {
  if (computerTimer || computerError || computerDeadlock || !computerActing()) return;
  computerTimer = setTimeout(()=>{
    computerTimer = null;
    if (!computerActing()) return;
    try {
      const side = currentActor();
      const action = computerAction(playerView(game,side),side);
      if (['resolve-deadlock','review-contacts'].includes(action?.type)) {
        computerDeadlock = action.type;
        render();
      } else if (action) dispatch(action,true);
    } catch (error) {
      computerError = true;
      setNotice('Computer paused. '+error.message);
    }
  },aiPaces[preferences.aiPace]);
}

function chooseUnit(id, kind) {
  const s = publicState(), u = find(s,id);
  if (!interactive() || !u) return;
  const who = currentActor();
  stackAt = null;
  if (s.phase==='plan') {
    if (!draft?.eligible.has(id)) return;
    if (u.side===who) attacks = attacks.includes(id)?attacks.filter(a=>a!==id):[...attacks,id];
    else defenses = defenses.includes(id)?defenses.filter(d=>d!==id):[...defenses,id];
  } else if (s.phase==='loss') {
    if (!s.battle.losses[0].ids.includes(id) || !u.pos) return;
    if (losses[id]) delete losses[id];
    else {
      const stepOnly = s.battle.losses[0].stepOnly;
      if (stepOnly) losses = {};
      losses[id] = !u.reduced&&(stepOnly || lossCost(s,u,'reduce')) ? 'reduce' : 'eliminate';
    }
  } else if ((s.phase==='retreat'&&s.battle.retreat.includes(id)) ||
      (s.phase==='withdraw'&&withdrawalUnits(s).some(p=>p.id===id)) || (s.phase==='advance'&&advanceUnits(s).some(p=>p.id===id)) ||
      (s.phase==='deploy'&&u.side===who&&setupPool(s,who).includes(u)) || (s.phase==='move'&&u.side===who)) {
    selected = selected===id && kind==='board' ? null : id;
    special = false;
  } else return;
  message = '';
  render();
}

function pickHex(id) {
  hit = id;
  if (!interactive()) return;
  const s = publicState();
  if (selected && targetIds.has(id)) {
    const u = find(s,selected);
    const type = s.phase==='deploy'?(u.pos?'reposition-deploy':'deploy'):['retreat','withdraw','advance'].includes(s.phase)?s.phase:
      !u.pos?'reinforce':special?'special':'move';
    dispatch({type,unit:selected,to:id});
    return;
  }
  const stack = unitsAt(s,id);
  if (stack.length>1) { stackAt = stackAt===id?null:id; render(); }
  else if (stack[0]) chooseUnit(stack[0].id,'board');
}

function inspect(id) {
  const s = publicState(), board = s ? boardOf(s) : previewBoard();
  if (!board.cells[id] || blocked) return;
  const cell = board.cells[id];
  const u = s && unitAt(s,id);
  const path = routeOptions[id];
  const mf = path?.cost===undefined?'':(' · '+(Math.round(path.cost/3*100)/100)+' MF');
  lastReadout = cell.label+' · '+(cell.coastal?'Coastal city':terrainLabels[cell.terrain])+capital(cell)+(u?' · '+u.id+' '+u.cf+'–'+u.mf:'')+mf;
  $('hex-readout').textContent = lastReadout;
  const origin = find(s,selected)?.pos;
  const route = $('route');
  if (route) route.setAttribute('points',origin&&path?.route?
    [origin,...path.route].map(key=>xOf(board.cells[key])+','+yOf(board.cells[key])).join(' '):'');
}
function readOptional() {
  return normalizeOptions(Object.fromEntries([...$('advanced-rules').querySelectorAll('[data-rule]')].map(field=>
    [field.dataset.rule,field.type==='checkbox'?field.checked:field.value])));
}

function validateSetup() {
  const errors = ruleErrors(readOptional(),$('loss-rule').value);
  $('setup-errors').textContent = errors.join(' ');
  $('setup-errors').hidden = !errors.length;
  $('setup-apply').disabled = !!errors.length;
  return !errors.length;
}

let replayAt;

function openFieldReport() {
  const [report] = formatFieldReport(game).split('\n## Replay data\n');
  const content = esc(report.replace(/^# Kriegspiel Field Report\n+/, ''))
    .replace(/^(#{2,4}) (.+)$/gm,(_,level,title)=>
      '<strong role="heading" aria-level="'+level.length+'" class="field-report-section level-'+level.length+'">'+title+'</strong>')
    .replace(/\*\*([^\n]+?)\*\*/g,'<strong>$1</strong>');
  $('field-report-body').innerHTML = '<div class="field-report-text">'+content+'</div>';
  $('field-report-views').hidden = !game.record;
  $('field-report-status').textContent = '';
  $('replay-board').replaceChildren();
  $('replay-step').max = game.record?.orders.length ?? 0;
  $('replay-step').value = 0;
  replayAt = null;
  showReportView(false);
  $('field-report').showModal();
  $('field-report-body').scrollTop = 0;
}

function showReportView(replay) {
  $('field-report-body').hidden = replay;
  $('field-replay').hidden = !replay;
  for (const button of $('field-report-views').querySelectorAll('button')) {
    button.setAttribute('aria-pressed',String((button.dataset.do==='replay-view')===replay));
  }
  if (replay) {
    replayAt ??= createReplay(game.record);
    renderReplay(Number($('replay-step').value));
  }
}

function renderReplay(step) {
  const total = game.record.orders.length;
  $('replay-step').value = step;
  $('replay-position').textContent = step+' / '+total+' orders';
  for (const button of $('field-replay').querySelectorAll('button')) {
    button.disabled = ['replay-first','replay-prev'].includes(button.dataset.do) ? step===0 : step===total;
  }
  try {
    const view = replayAt(step);
    $('replay-order').textContent = view.entry
      ? view.entry.notation+(view.entry.plain?' — '+view.entry.plain:'')
      : 'Initial position before deployment.';
    drawBoard(view.state,boardOf(view.state),view);
  } catch (error) {
    replayAt = createReplay(game.record);
    $('replay-board').replaceChildren();
    $('replay-order').textContent = 'Could not replay this order. '+error.message;
  }
}

async function copyFieldReport() {
  const report = formatFieldReport(game);
  const status = $('field-report-status');
  try {
    await navigator.clipboard.writeText(report);
  } catch {
    const text = document.createElement('textarea');
    text.value = report;
    text.readOnly = true;
    text.className = 'field-report-copy';
    $('field-report').append(text);
    text.select();
    let copied = false;
    try { copied = document.execCommand('copy'); }
    catch { /* Clipboard access can be blocked on a LAN address. */ }
    finally { text.remove(); }
    $('field-report').querySelector('[data-do="copy-report"]').focus();
    if (!copied) { status.textContent = 'Clipboard unavailable. Use Download report.'; return; }
  }
  status.textContent = 'Report copied.';
}

function openSettings() {
  $('trail-scope').innerHTML = options(trailScopes,preferences.showTrails?preferences.trailScope:'off');
  $('preference-pace').innerHTML = options({fast:'Fast · 0.18 seconds',watch:'Watch · 0.75 seconds',slow:'Slow · 1.5 seconds'},preferences.aiPace);
  $('map-tone').innerHTML = options(mapTones,preferences.mapTone);
  $('red-color').value = preferences.red;
  $('blue-color').value = preferences.blue;
  if (!$('preferences').open) $('preferences').showModal();
}

function applyPreferences() {
  saveLocal(controlsKey,preferences);
  clearTimeout(computerTimer);
  computerTimer = null;
  render();
}

function openGameRules(defaultsMode = false, reset = false) {
  if (!defaultsMode && (pending || (lan && !game))) return;
  editingDefaults = defaultsMode;
  const settings = defaultsMode ? (reset ? coreRules : ruleDefaults) : game ?? { ...choice,...ruleDefaults };
  const viewOnly = !defaultsMode && (!!game || !!lan);
  $('game-setup-title').textContent = defaultsMode?'Default game rules':viewOnly?'Table rules':'Review game rules';
  $('setup-summary').textContent = defaultsMode?'These rules prefill new games in this browser. You can change them for any individual game.':
    modes[settings.mode]+' · '+mapsAvailable[settings.map]+(viewOnly?' · rules for this table':' · confirm the options before deployment');
  $('terrain-choice').checked = settings.terrain===true;
  $('setup-choice').innerHTML = options({free:'Choose divisions · Game I',fixed:'Fixed corps · §11.1',full:'Full deployment · §11.2'},settings.setup);
  $('loss-rule').innerHTML = options(lossRules,settings.lossRule ?? 'whole');
  $('retreat-rule').innerHTML = options(retreatRules,settings.retreatRule ?? 'printed');
  $('human-side').innerHTML = options({R:'Red',B:'Blue'},settings.human);
  $('difficulty').innerHTML = options(difficulties,settings.difficulty ?? 'standard');
  $('advanced-rules').innerHTML = optionalSections.map(([ref,title,fields])=>{
    const count = fields.filter(([key])=>settings.optional?.[key]).length;
    return '<details class="rule-group"><summary>§§'+ref+' · '+title+(count?' · '+count+' enabled':'')+'</summary>'+
      fields.map(([key,rule,label,description,values])=>{
        const detail = '<span><b>'+label+' · §'+rule+'</b><small>'+description+'</small></span>';
        const current = settings.optional?.[key] ?? (key==='initiative'?'turn':undefined);
        return values ? '<label class="rules-select">'+detail+'<select data-rule="'+key+'">'+options(key==='initiative'?values:{'':'Off',...values},current??'')+'</select></label>'
          : '<label class="rule-check"><input type="checkbox" data-rule="'+key+'" '+(current?'checked':'')+'>'+detail+'</label>';
      }).join('')+'</details>';
  }).join('');
  $('advanced-rules').disabled = viewOnly;
  $('difficulty').disabled = viewOnly;
  validateSetup();
  $('setup-faction').hidden = defaultsMode || settings.mode!=='computer';
  $('optional-rules').disabled = viewOnly;
  $('table-conventions').disabled = viewOnly;
  $('human-side').disabled = viewOnly;
  $('setup-cancel').textContent = viewOnly?'Close':'Cancel';
  $('setup-apply').hidden = viewOnly;
  $('reset-rules').hidden = !defaultsMode;
  $('setup-apply').textContent = defaultsMode?'Save default rules':{ solo:'Start solitaire',computer:'Start vs computer',hot:'Start hot-seat',lan:'Create LAN room' }[settings.mode];
  if (!$('game-setup').open) $('game-setup').showModal();
}

function rulesFromForm() {
  return { terrain:$('terrain-choice').checked,setup:$('setup-choice').value,lossRule:$('loss-rule').value,
    retreatRule:$('retreat-rule').value,optional:readOptional() };
}

async function startGame() {
  if (pending || game || lan || !validateSetup()) return;
  choice = { ...choice,...rulesFromForm(),human:$('human-side').value,difficulty:$('difficulty').value };
  $('game-setup').close();
  message = '';
  if (choice.mode!=='lan') {
    try { game = createGame(choice); } catch (error) { setNotice(error.message); return; }
    clearChoices();
    persist();
    render();
  } else {
    pending = true;
    render();
    try { openSeat(await api('/rooms',choice)); }
    catch(error) { message = error.message; }
    finally { pending = false; render(); }
  }
}

const simpleActions = new Set(['undo','recall-deployment','preview-deploy','auto-deploy','deploy-ready','end-move','resolve-deadlock','clear-plan','auto-plan','start-battles','end-withdraw','end-battle','continue-battle']);
document.addEventListener('click',async event=>{
  const target = event.target.closest('[data-do]');
  if (target) {
    const cmd = target.dataset.do;
    if (simpleActions.has(cmd)) { dispatch({type:cmd}); return; }
    if (cmd==='mode') { choice.mode = target.dataset.mode; setNotice(''); render(); }
    else if (cmd==='settings') openSettings();
    else if (cmd==='reset-settings') { preferences = {...defaults}; openSettings(); applyPreferences(); }
    else if (cmd==='help') $('manual').showModal();
    else if (cmd==='game-rules') openGameRules();
    else if (cmd==='rule-defaults') openGameRules(true);
    else if (cmd==='reset-rules') openGameRules(true,true);
    else if (cmd==='close-game-rules') $('game-setup').close();
    else if (cmd==='rule') openRules(Number(target.dataset.page) || readerPage);
    else if (cmd==='chart') {
      const alternate = (game?.lossRule ?? choice.lossRule)==='crt';
      $('chart-edition').textContent = alternate?'COMBAT RESOLUTION / TABLE 11':'COMBAT RESOLUTION / TABLE 4';
      $('full-crt').innerHTML = combatChart(blocked?null:publicState()?.battle,false,alternate);
      $('combat-chart').showModal();
    }
    else if (cmd==='new') {
      if (game || lan) { $('new-table').returnValue = ''; $('new-table').showModal(); }
      else $('command-body').querySelector('.mode-choice')?.focus();
    } else if (cmd==='handoff') {
      blocked = false;
      persist();
      render();
      const desk = $('command-body');
      (desk.querySelector('.tactic-orders .order') ?? desk.querySelector('button'))?.focus({preventScroll:true});
    } else if (cmd==='fit' || cmd.startsWith('zoom-')) {
      zoomBoard(cmd==='fit'?1:zoom*(cmd==='zoom-in'?1.25:.8));
    } else if (cmd==='zoc') { showZone = !showZone; render(); }
    else if (cmd==='trails') {
      preferences.showTrails = !preferences.showTrails || preferences.trailScope==='off';
      if (preferences.trailScope==='off') preferences.trailScope = 'recent';
      applyPreferences();
    }
    else if (['unit','battle-unit','loss-unit'].includes(cmd)) chooseUnit(target.dataset.unit);
    else if (cmd==='special-mode') { special = !special; render(); }
    else if (cmd==='select-deploy-side') dispatch({type:cmd,side:enemy(currentActor())});
    else if (cmd==='undeploy') dispatch({type:'undeploy',unit:selected});
    else if (cmd==='add-battle') dispatch({type:'add-battle',a:attacks,d:defenses});
    else if (cmd==='remove-battle') dispatch({type:'remove-battle',index:Number(target.dataset.index)});
    else if (cmd==='authorize-deadlock' && computerDeadlock && computerActing()) {
      const type = computerDeadlock;
      computerDeadlock = false;
      dispatch({type},true);
    }
    else if (cmd==='clear-draft') { clearChoices(); render(); }
    else if (cmd==='tactic' || cmd==='roll') dispatch({type:'choose-tactic',choice:cmd==='roll'?'roll':Number(target.dataset.choice)});
    else if (cmd==='take-loss') dispatch({type:'take-loss',losses:Object.entries(losses).map(([id,kind])=>({id,kind}))});
    else if (cmd==='hold-defenders' || cmd==='order-retreat') dispatch({type:'retreat-choice',retreat:cmd==='order-retreat'});
    else if (cmd==='retreat-trapped') dispatch({type:'retreat',unit:selected});
    else if (cmd==='reset-unit-move') dispatch({type:cmd,unit:selected});
    else if (cmd==='confirm-reset-move' && interactive()) {
      $('reset-movement').returnValue = '';
      $('reset-movement').showModal();
    }
    else if (cmd==='view-report' && game?.phase==='over') openFieldReport();
    else if (cmd==='report-view') showReportView(false);
    else if (cmd==='replay-view' && game?.record) showReportView(true);
    else if (['replay-first','replay-prev','replay-next','replay-last'].includes(cmd) && replayAt) {
      const step = Number($('replay-step').value), end = game.record.orders.length;
      renderReplay({'replay-first':0,'replay-prev':Math.max(0,step-1),'replay-next':Math.min(end,step+1),'replay-last':end}[cmd]);
    }
    else if (cmd==='copy-report' && game?.phase==='over') await copyFieldReport();
    else if (cmd==='export-report' && game?.phase==='over') {
      const url = URL.createObjectURL(new Blob([formatFieldReport(game)],{type:'text/markdown;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'kriegspiel-field-report.md';
      link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    else if (cmd==='copy-invite') {
      const field = $('invite-url');
      try {
        if (!navigator.clipboard) throw new Error();
        await navigator.clipboard.writeText(field.value);
        setNotice('Invite copied.');
      } catch {
        field.select();
        setNotice(document.execCommand('copy')?'Invite copied.':'Invite selected. Press Ctrl+C to copy it.');
      }
    }
    return;
  }
  const hex = event.target.closest('[data-hex]');
  if (hex) pickHex(hex.dataset.hex);
});

document.addEventListener('change',event=>{
  const target = event.target;
  const id = target.id;
  if (target.closest('#rules-form')) { validateSetup(); return; }
  if (target.matches('[data-nuke-target]')) { refreshStrike(publicState(),target); return; }
  if (target.dataset.loss) {
    if (target.value==='keep') delete losses[target.dataset.loss];
    else {
      if (game?.battle?.losses?.[0]?.stepOnly) losses = {};
      losses[target.dataset.loss] = target.value;
    }
    render();
    $('command-body').querySelector('[data-loss="'+target.dataset.loss+'"]')?.focus();
    return;
  }
  if (id==='ai-pace' && Object.hasOwn(aiPaces,target.value)) {
    preferences.aiPace = target.value;
    applyPreferences();
    return;
  }
  const field = { 'map-choice':'map','layout-choice':'layout' }[id];
  if (id==='rotate-red' || id==='rotate-blue') choice.rotations[id==='rotate-red'?'R':'B'] = event.target.value;
  else if (field) choice[field] = event.target.value;
  else return;
  if (field==='map' || field==='layout') zoom = 1;
  render();
  $(id)?.focus();
});
document.addEventListener('keydown',event=>{
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase()!=='z' || !canUndo()) return;
  if (event.target.closest('input,textarea,select,[contenteditable],dialog') || document.querySelector('dialog[open]')) return;
  event.preventDefault();
  dispatch({type:'undo'});
});
document.addEventListener('input',event=>{
  if (event.target.id==='room-code') {
    roomInput = event.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,6);
    event.target.value = roomInput;
  }
});
document.addEventListener('submit',async event=>{
  if (event.target.id==='preferences-form') {
    event.preventDefault();
    preferences = { showTrails:$('trail-scope').value!=='off',trailScope:$('trail-scope').value,
      aiPace:$('preference-pace').value, red:$('red-color').value,blue:$('blue-color').value,mapTone:$('map-tone').value };
    $('preferences').close();
    applyPreferences();
    return;
  }
  if (event.target.matches('[data-order]')) {
    event.preventDefault();
    const data = new FormData(event.target);
    const action = { ...Object.fromEntries(data),type:event.target.dataset.order };
    for (const key of ['units','artillery']) action[key] = data.getAll(key);
    for (const key of ['rotate','convert','skip']) if (key in action) action[key] = action[key]==='true';
    if ('deal' in action) action.deal = Number(action.deal);
    action.supplyByUnit = Object.fromEntries([...data].filter(([key])=>key.startsWith('supply:')).map(([key,value])=>[key.slice(7),value]));
    action.decoys = [action.decoy1,action.decoy2].filter(Boolean);
    action.blast = [action.blast1,action.blast2].filter(Boolean);
    dispatch(action);
    return;
  }
  if (event.target.id==='rules-form') {
    event.preventDefault();
    if (editingDefaults) {
      if (!validateSetup()) return;
      ruleDefaults = rulesFromForm();
      saveLocal(rulesKey,ruleDefaults);
      $('game-setup').close();
      render();
    } else await startGame();
    return;
  }
  if (event.target.id!=='join') return;
  event.preventDefault();
  if (pending || !/^[A-F0-9]{6}$/.test(roomInput)) return;
  pending = true;
  render();
  try {
    const saved = getLocal(appKey+'/'+roomInput);
    if (saved) {
      const data = await api('/rooms/'+roomInput,undefined,saved.key);
      openSeat({ ...data, code:saved.code, key:saved.key });
    } else openSeat(await api('/rooms/'+roomInput+'/join',{}));
    message = '';
  } catch(error) { message = error.message; }
  finally { pending = false; render(); }
});

$('replay-step').addEventListener('change',event=>{
  if (replayAt) renderReplay(Number(event.target.value));
});
$('field-report').addEventListener('close',()=>{ replayAt = null; });

$('reset-movement').addEventListener('close',()=>{
  if ($('reset-movement').returnValue==='reset' && interactive()) dispatch({type:'reset-move'});
});

$('new-table').addEventListener('close',()=>{
  if ($('new-table').returnValue!=='reset') return;
  clearInterval(pollTimer);
  clearTimeout(computerTimer);
  computerTimer = null;
  computerError = false;
  computerDeadlock = false;
  if (game) choice = { ...choice,...ruleDefaults,mode:game.mode,
    human:game.human ?? 'R',difficulty:game.difficulty ?? 'standard' };
  game = null;
  undoPoint = null;
  lanUndo = false;
  lan = null;
  connected = false;
  serverActor = null;
  roomInput = '';
  blocked = false;
  pending = false;
  message = '';
  zoom = 1;
  showZone = false;
  clearChoices();
  persist();
  history.replaceState({},'',location.pathname);
  render();
});

$('board').addEventListener('pointerover',event=>{
  if (pan) return;
  const hex = event.target.closest('[data-hex]');
  if (hex) inspect(hex.dataset.hex);
});
const viewport = $('viewport');
let pan = null;
viewport.addEventListener('wheel',event=>{
  if (blocked) return;
  event.preventDefault();
  const delta = event.deltaMode===1?event.deltaY*16:event.deltaMode===2?event.deltaY*viewport.clientHeight:event.deltaY;
  zoomBoard(zoom*Math.exp(-delta*.0018),event.clientX,event.clientY);
},{passive:false});
viewport.addEventListener('pointerdown',event=>{
  if (event.button!==1 || blocked) return;
  event.preventDefault();
  pan = {pointer:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('panning');
  $('route')?.setAttribute('points','');
});
viewport.addEventListener('pointermove',event=>{
  if (pan?.pointer!==event.pointerId) return;
  viewport.scrollLeft = pan.left + pan.x - event.clientX;
  viewport.scrollTop = pan.top + pan.y - event.clientY;
});
viewport.addEventListener('lostpointercapture',()=>{
  pan = null;
  viewport.classList.remove('panning');
});
viewport.addEventListener('auxclick',event=>{ if (event.button===1) event.preventDefault(); });
$('board').addEventListener('pointerleave',()=>{
  $('route')?.setAttribute('points','');
});
$('board').addEventListener('focusin',event=>{
  const id = event.target.dataset.hex;
  if (id) inspect(id);
});
$('board').addEventListener('keydown',event=>{
  const id = event.target.dataset.hex;
  if (!id || blocked) return;
  if (event.key==='Enter' || event.key===' ') {
    event.preventDefault();
    pickHex(id);
    $('board').querySelector('[tabindex="0"]')?.focus();
    return;
  }
  const steps = { ArrowLeft:[[-1,-1],[-1,1]], ArrowRight:[[1,1],[1,-1]], ArrowUp:[[0,-2],[-1,-1],[1,-1]], ArrowDown:[[0,2],[1,1],[-1,1]] }[event.key];
  if (!steps) return;
  event.preventDefault();
  const [c,y] = id.split(',').map(Number);
  for (const [dc,dy] of steps) {
    const next = (c+dc)+','+(y+dy);
    const element = $('board').querySelector('[data-hex="'+next+'"]');
    if (!element) continue;
    event.target.setAttribute('tabindex','-1');
    element.setAttribute('tabindex','0');
    hit = next;
    element.focus();
    break;
  }
});

const ruleSections = {
  1:'Cover',3:'Contents',4:'Components and terrain table',5:'Setup and victory',6:'Turn order and ZOC',
  7:'Movement and reinforcements',8:'Invasions, drops, and forced combat',9:'Combat resolution table',
  10:'Tactics, losses, and retreats',11:'Retreats and advances',12:'Game II · Optional rules',
  14:'Terrain effects',17:'Nuclear weapons',20:'Supply',22:'Peace negotiations',24:'Step loss and paratroopers',
  27:'Game III · Solitaire',29:'Game IV · Scenario',30:'Order of battle',32:'Example map',33:'Charts and player aids'
};
$('reader-section').innerHTML = options(ruleSections,'3');
let readerPage = 3;
function setRulePage(number) {
  if (!Number.isInteger(number)) { $('reader-number').value = readerPage; return; }
  readerPage = Math.max(1,Math.min(47,number));
  const section = Object.keys(ruleSections).map(Number).filter(page=>page<=readerPage).at(-1);
  $('reader-section').value = String(section);
  $('reader-number').value = readerPage;
  $('reader-prev').disabled = readerPage===1;
  $('reader-next').disabled = readerPage===47;
  const page = $('reader-image');
  page.alt = 'Kriegspiel rulebook, page '+readerPage+(ruleSections[readerPage]?' · '+ruleSections[readerPage]:'');
  page.src = '/rules/page-'+String(readerPage).padStart(2,'0')+'.webp';
  $('reader-scroll').scrollTop = 0;
}
function openRules(page) {
  $('rulebook').showModal();
  setRulePage(page);
}
$('reader-prev').addEventListener('click',()=>setRulePage(readerPage-1));
$('reader-next').addEventListener('click',()=>setRulePage(readerPage+1));
$('reader-section').addEventListener('change',event=>setRulePage(Number(event.target.value)));
$('reader-number').addEventListener('change',event=>setRulePage(event.target.valueAsNumber));
$('rulebook').addEventListener('keydown',event=>{
  if (event.target.matches('input,select') || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  setRulePage(readerPage+(event.key==='ArrowRight'?1:-1));
});

new ResizeObserver(fitBoard).observe($('viewport'));
const saved = getLocal(appKey);
if (roomInput) {
  choice.mode = 'lan';
  const existing = getLocal(appKey+'/'+roomInput);
  if (existing) {
    lan = existing;
    pollTimer = setInterval(poll,1050);
    poll();
  }
} else if (saved?.game?.units && saved.game.mode!=='lan') {
  game = saved.game;
  blocked = !!saved.blocked;
  undoPoint = saved.undoPoint?.units ? saved.undoPoint : null;
} else if (saved?.lan) {
  lan = saved.lan;
  choice.mode = 'lan';
  pollTimer = setInterval(poll,1050);
  poll();
}
render();
api('/info').then(data=>{ addresses=data.addresses; if (lan) render(); }).catch(()=>{});


