import { distance, hasCAP, months } from './options.mjs';
import * as charts from './optional-charts.mjs';
import * as geography from './optional-terrain.mjs';
import {
  actor, battleOdds, boardOf, canEnter, contacts, eliminate, endSide, enemy,
  finishBattle, name, note, openFor, paths, pieces, place, reduce, relocate, reserve, sides,
  strength, suggestBattles, unitAt, unitsAt, zone
} from './game.mjs';

const roll = rng=>Math.floor(rng()*6)+1;
const check = (value,message)=>{if (!value) throw new Error(message);};
const choices = (s,side)=>s.campaign.stock[side];
const home = (s,h)=>s.control[h.id] ?? h.home;
const hexAt = (s,id)=>Object.hasOwn(boardOf(s).cells,id) ? boardOf(s).cells[id] : null;
const capital = (s,side)=>Object.values(boardOf(s).cells).filter(h=>h.cap===side);
const friendlyCities = (s,side)=>Object.values(boardOf(s).cells).filter(h=>h.terrain==='city'&&home(s,h)===side);
const fullCapital = (s,side)=>capital(s,side).every(h=>home(s,h)===side);
const markers = {
  R:{supply:['H11','G17'],pow:['H4'],rocket:['F12'],icbm:['I7']},
  B:{supply:['FF4','DD17'],pow:['JJ10'],rocket:['CC10'],icbm:['JJ11']}
};
const stock = (s,side)=>({
  rf:0, air:s.optional.air==='limited'?(side==='R'?3:6):0, log:0, abm:0, replacement:0,
  rocket:s.optional.nuclear?(side==='R'?5:2):0, icbm:s.optional.nuclear?(side==='R'?1:2):0,
  lastRocket:0,lastICBM:0,spentNukes:0,bonus:0,peace:s.optional.peace?4:0
});
function labeledSite(s,side,kind,label,index) {
  const board = boardOf(s);
  const exact = Object.values(board.cells).find(h=>h.home===side&&h.label===label);
  if (exact && (kind!=='supply'||exact.terrain==='city') && !(kind==='pow'&&s.optional.alternatePow&&exact.terrain!=='clear')) return exact.id;
  if (kind==='supply') return Object.values(board.cells).filter(h=>h.home===side&&h.terrain==='city'&&!h.cap)[index]?.id;
  const legal = Object.values(board.cells).filter(h=>h.home===side&&h.terrain==='clear');
  const offset = { pow:13,rocket:31,icbm:49 }[kind];
  return legal[offset%legal.length]?.id;
}
export function initializeCampaign(s,rng) {
  if (!Object.keys(s.optional).some(key=>key!=='initiative')) return;
  const o = s.optional;
  const sites = [];
  for (const side of sides) for (const [kind,labels] of Object.entries(markers[side])) {
    const enabled = kind==='supply'?o.supply:kind==='pow'?o.pow:o.nuclear;
    if (!enabled) continue;
    for (const [i,label] of labels.entries()) {
      const pos = labeledSite(s,side,kind,label,i);
      if (pos && !sites.some(m=>m.pos===pos&&m.kind===kind)) sites.push({kind,side,pos});
    }
  }
  if (o.supply==='cities') for (const side of sides) {
    if (side==='B') {
      const pos = labeledSite(s,side,'supply','GG8',2);
      if (pos&&!sites.some(m=>m.pos===pos&&m.kind==='supply')) sites.push({kind:'supply',side,pos});
    }
    sites.push({kind:'supply',side,pos:capital(s,side)[0]?.id,capital:true});
  }
  s.campaign = {stock:{R:stock(s,'R'),B:stock(s,'B')},sites,strikes:{},deals:[],
    captureMode:{R:false,B:false},serial:0,startMonth:o.month==='random'?roll(rng)+roll(rng):Number(o.month||9)};
}
export const damaged = (s,id)=>!!s?.campaign?.strikes[id];
export const frozen = (s,h)=>!!(s?.weather==='snow'&&h&&geography.isFrozenHex?.(s,h));
const isLiveSite = (s,site)=>!site.captured&&!damaged(s,site.pos)&&(!site.capital||!capital(s,site.side).some(h=>unitAt(s,h.id)?.side===enemy(site.side)));
export function supplyCenter(s,side) {
  return s.campaign?.sites.filter(m=>m.kind==='supply'&&m.side===side&&isLiveSite(s,m)) ?? [];
}

function treaty(s,key,side) {
  return !!s.campaign?.deals.some(deal=>deal[key]?.includes(side)&&
    (deal.ends===undefined||s.turn<=deal.ends)&&(!['noRF','noAir'].includes(key)||deal.resourceEnds===undefined||s.turn<=deal.resourceEnds)&&(!deal.withdraw||pieces(s,deal.withdraw).some(u=>hexAt(s,u.pos)?.home===enemy(deal.withdraw))));
}
export const movementAllowed = (s,side)=>!treaty(s,'immobile',side);
export const combatAllowed = (s,side)=>!treaty(s,'cease',side);
export const specialAllowed = (s,side)=>!treaty(s,'noSpecial',side);
export function treatyDestination(s,u,id) {
  if (!s.campaign?.deals.some(d=>d.withdraw===u.side)) return true;
  const board=boardOf(s), from=board.cells[u.pos], to=board.cells[id];
  if (from.home!==enemy(u.side)) return to.home!==enemy(u.side);
  const border=board.cols===10 ? h=>u.side==='R'?h.y:-h.y : h=>u.side==='R'?h.c:-h.c;
  return border(to)<border(from);
}

export function campaignTurn(s,rng) {
  if (!s.optional?.weather) return;
  const was = s.weather;
  s.month = (s.campaign.startMonth+s.turn-2)%12+1;
  const weather = charts.weatherByMonth;
  s.weather = weather?.[s.month]?.[roll(rng)-1] ?? 'clear';
  if (was==='snow'&&s.weather!=='snow') for (const u of pieces(s)) {
    const h = hexAt(s,u.pos);
    if (h.terrain==='sea'&&frozen({...s,weather:'snow'},h)) eliminate(s,u);
  }
  note(s,months[s.month-1]+' · '+s.weather+' weather.');
}

export function prepareCampaign(s,side) {
  if (!s.campaign) return;
  const r = choices(s,side);
  const o = s.optional;
  const installs = supplyCenter(s,side).length;
  if (o.replacement==='factors'&&!treaty(s,'noRF',side)) {
    r.rf += Math.min(3,boardOf(s).cities.R.concat(boardOf(s).cities.B).filter(group=>
      group.every(id=>home(s,hexAt(s,id))===side&&!damaged(s,id))).length);
  }
  if (o.replacement==='units'&&s.units.some(u=>u.dead&&u.side===side&&u.type!=='LOG')) r.replacement++;
  const capitalHit = capital(s,side).some(h=>damaged(s,h.id));
  if (!capitalHit&&!treaty(s,'noAir',side)) {
    if (o.air==='cap'&&s.turn>=3&&fullCapital(s,side)) r.air += 3;
    if (o.air==='limited') r.air = Math.min(9,r.air+installs);
    if (o.air==='ground') r.air = installs;
  }
  if (o.abm&&fullCapital(s,side)) r.abm += 4;
  if (o.supply==='logistics') r.log += Math.max(installs,Number(treaty(s,'minLog',side)));
  else if (o.peace&&treaty(s,'minLog',side)) r.log++;
  if (r.bonus) {
    s.credit[side] = Math.min(s.credit[side]+r.bonus,reserve(s,side).length);
    r.bonus=0;
  }
  r.removeDue = treaty(s,'removeUnit',side)&&pieces(s,side).some(u=>u.type!=='LOG');
  r.breakTried = false;
}

function supplyPath(s,u,limit = Infinity, logistic = s.optional?.supply==='logistics', preferred) {
  if (!u?.pos) return null;
  const board = boardOf(s);
  const points = logistic?pieces(s,u.side).filter(v=>v.type==='LOG'&&!v.capturedThisTurn):
    supplyCenter(s,u.side).flatMap(m=>m.capital?capital(s,u.side).map(h=>({...m,pos:h.id})):m);
  if (!points.length) return null;
  const enemyZone = zone(s,enemy(u.side));
  const queue = [[u.pos,0]];
  const seen = new Set([u.pos]);
  for (const [id,n] of queue) {
    const p=points.find(v=>v.pos===id&&(!preferred||v.id===preferred));
    if (p) return p;
    if (n>=limit) continue;
    for (const next of board.cells[id]?.adj ?? []) {
      const h = board.cells[next];
      if (seen.has(next)||enemyZone.has(next)||unitAt(s,next)?.side===enemy(u.side)||damaged(s,next)||
          (h.terrain==='sea'&&!frozen(s,h))||s.weather==='snow'&&h.terrain==='mountain') continue;
      seen.add(next);
      queue.push([next,n+1]);
    }
  }
  return null;
}
export function battleSupplyChoices(s) {
  if (s.optional?.supply!=='logistics'||!s.battle) return [];
  const supply = pieces(s,s.active).filter(u=>u.type==='LOG'&&!u.capturedThisTurn);
  return s.battle.a.map(id=>{
    const u = s.units.find(v=>v.id===id);
    return [id,supply.filter(point=>supplyPath(s,u,3,true,point.id))];
  });
}
function spendBattleSupply(s,selection={}) {
  for (const [id,points] of battleSupplyChoices(s)) {
    const point = selection[id]?points.find(u=>u.id===selection[id]):points[0];
    check(point||!selection[id],'Choose a logistic unit that can supply that attacker.');
    if (point) point.supported=true;
  }
}
export const attackSupplied = (s,u)=>s.optional?.supply!=='logistics'||!!supplyPath(s,u,3);

function freePrisoners(s,captor) {
  const camp = s.campaign.sites.find(m=>m.kind==='pow'&&m.side===captor);
  for (const u of s.units.filter(u=>u.pow===captor)) {
    delete u.pow;
    if (s.optional.alternatePow && !u.reduced) reduce(s,u);
    u.released = s.optional.alternatePow && camp ? camp.pos : true;
    u.releaseTurn = s.active===u.side ? s.turn+1 : s.turn;
  }
}
function imprison(s,u,side) {
  u.pos = null;
  u.landing = null;
  u.pow = side;
  delete u.fort;
}
export function captureLogistics(s,u,id) {
  if (!s.optional?.supply) return;
  const mode = s.campaign.captureMode[u.side];
  for (const other of unitsAt(s,id).filter(v=>v.side!==u.side&&v.type==='LOG')) {
    if (mode) { other.side=u.side; other.capturedThisTurn=true; u.stopped=true; }
    else eliminate(s,other);
  }
}
export function finishCampaign(s,side) {
  if (!s.campaign) return;
  const o=s.optional;
  for (const site of s.campaign.sites) {
    const occupier=unitAt(s,site.pos);
    if (site.kind==='rocket'||site.kind==='icbm') {
      if (occupier?.side===side&&side!==site.side&&!site.captured) {
        site.captured=true;
        choices(s,side)[site.kind]+=choices(s,site.side)[site.kind];
        choices(s,site.side)[site.kind]=0;
        note(s,name(side)+' captured the '+site.kind.toUpperCase()+' arsenal.');
      }
    } else if (site.kind==='pow') {
      if (s.captured[site.pos]===enemy(site.side)&&!site.captured) {
        site.captured=true;
        freePrisoners(s,site.side);
      }
      if (occupier?.side===site.side) site.captured=false;
    } else {
      if (s.captured[site.pos]===enemy(site.side)) site.captured=true;
      if (s.captured[site.pos]===site.side) site.captured=false;
    }
  }
  if (o.supply==='logistics' && s.campaign.sites.filter(m=>m.kind==='supply'&&m.side===enemy(side)).every(m=>m.captured)) {
    choices(s,side).thirdSupply=true;
  }
  if (o.supply) for (const u of pieces(s,side).filter(u=>u.type!=='LOG')) {
    u.isolation=hexAt(s,u.pos).home===enemy(side)&&!supplyPath(s,u)?(u.isolation??0)+1:0;
    if (u.isolation>=2) {
      if (o.pow) imprison(s,u,enemy(side));
      else if (s.lossRule!=='whole') reduce(s,u);
      else eliminate(s,u);
      note(s,u.id+' suffered isolation.');
    }
  }
  for (const u of pieces(s,side).filter(u=>u.type==='LOG')) {
    if (u.supported) eliminate(s,u);
    delete u.capturedThisTurn;
  }
  for (const u of pieces(s,side).filter(u=>u.refit)) {
    restore(u);
    delete u.refit;
    note(s,u.id+' returned to full strength.');
  }
}
export function advanceCampaign(s) {
  if (s.turn<Number(s.optional?.turnLimit||Infinity)) return;
  const objective = s.optional.victory;
  const score = side => {
    if (objective==='territory') return pieces(s,side).filter(u=>u.type!=='LOG'&&hexAt(s,u.pos).home===enemy(side)&&
      (!s.optional.supply||supplyPath(s,u))).length;
    if (objective!=='objectives') return 0;
    const city = Object.values(boardOf(s).cells).filter(h=>h.terrain==='city'&&home(s,h)===side).length;
    const sites = s.campaign.sites.filter(m=>(m.kind==='rocket'||m.kind==='icbm')&&home(s,hexAt(s,m.pos))===side).length;
    return 2*city+sites+s.units.filter(u=>u.type!=='LOG'&&u.side===enemy(side)&&(u.dead||u.pow===side)).length;
  };
  const red=score('R'),blue=score('B');
  s.winner=red===blue?'draw':red>blue?'R':'B';
  s.reason='Turn limit reached'+(objective&&objective!=='draw'?' · Red '+red+' / Blue '+blue:'.');
}


export function campaignActor(s) {
  if (s.phase==='hold-ground') return s.battle.hold.side;
  if (s.phase==='crt-route') {
    const op=s.battle.operations[0];
    return op.kind==='retreat'?enemy(op.side):op.side;
  }
  return ['intercept','air-cap','surrender','peace-response'].includes(s.phase)?enemy(s.active):null;
}
export function campaignView(v,side) {
  const c=v.campaign;
  if (c&&v.phase==='deploy'&&v.mode!=='solo'&&v.optional.alternatePow) {
    const challengeView=v.optional.deployChallenge&&side===enemy(v.firstDeploy)&&v.deploying===side;
    v.campaign={...c,sites:c.sites.filter(site=>site.kind!=='pow'||site.side===side||challengeView)};
  }
  if (v.phase==='intercept') {
    v.campaign={...c, pending:{kind:c.pending.kind,candidates:c.pending.candidates}};
  }
  if (v.phase==='peace-response') v.campaign={...c, pending:{resume:c.pending.resume}};
  return v;
}
export function artilleryAvailable(s) {
  if (!s.optional?.artillery || !s.battle) return [];
  const board=boardOf(s), danger=zone(s,enemy(s.active));
  return pieces(s,s.active).filter(u=>u.type==='FA'&&!u.fired&&!danger.has(u.pos)&&
    s.battle.d.every(id=>distance(board.cells[u.pos],board.cells[s.units.find(v=>v.id===id)?.pos])<=u.range));
}
function startTactics(s,rng) {
  if (!s.optional?.pow) { s.phase='tactics'; return; }
  if (s.mode!=='solo') { s.phase='surrender'; return; }
  const odds=s.battle.odds.attack/s.battle.odds.defend;
  if (roll(rng)<=(odds>=3?4:odds>=2?2:1)) surrender(s);
  else s.phase='tactics';
}
export function battleBriefing(s,rng) {
  if (s.campaign && (battleSupplyChoices(s).some(([,points])=>points.length>1)||artilleryAvailable(s).length||
      s.weather!=='snow'&&s.optional.air&&choices(s,s.active).air)) s.phase='battle-support';
  else {
    spendBattleSupply(s);
    startTactics(s,rng);
  }
}
function surrender(s) {
  for (const id of s.battle.d) {
    const u=s.units.find(v=>v.id===id);
    if (u.pos) imprison(s,u,s.active);
  }
  s.battle.outcome='Surrender';
  s.battle.off=0;
  s.battle.def=2;
  note(s,name(enemy(s.active))+' surrendered all defenders in the battle.');
  finishBattle(s);
}

export function nuclearTargets(s,side,kind) {
  const site=s.campaign?.sites.find(m=>m.side===side&&m.kind===kind&&isLiveSite(s,m));
  if (!site||!choices(s,side)[kind]||!combatAllowed(s,side)) return [];
  const board=boardOf(s);
  return Object.values(board.cells).filter(h=>!damaged(s,h.id)&&(kind==='icbm'||distance(h,board.cells[site.pos])<=10));
}
export function beforeCombat(s,rng,allowDeadlock=false) {
  if (s.campaign) {
    for (const [id,side] of Object.entries(s.campaign.strikes)) if (side!==s.active) delete s.campaign.strikes[id];
    s.campaign.allowDeadlock=allowDeadlock;
    if (choices(s,s.active).removeDue) throw new Error('The peace agreement requires one division to leave the field.');
    if (s.optional.nuclear&&['rocket','icbm'].some(kind=>nuclearTargets(s,s.active,kind).length)) {
      s.phase='nuclear';
      return;
    }
  }
  beginGroundCombat(s,rng,allowDeadlock);
}
function beginGroundCombat(s,rng,allowDeadlock) {
  if (!combatAllowed(s,s.active)) { note(s,'Peace terms prohibit combat this half-turn.'); endSide(s,rng); return; }
  if (s.optional?.blockedInvasion && !suggestBattles(s)) {
    for (const u of pieces(s,s.active).filter(u=>u.landing||u.invaded)) {
      const beach=hexAt(s,u.landing??u.pos);
      if (beach.adj.filter(id=>unitAt(s,id)?.side===enemy(s.active)).length>1) {
        eliminate(s,u); note(s,u.id+' was lost in a blocked invasion.');
      }
    }
  }
  if (s.optional?.supply==='logistics') {
    const ids=contacts(s).a.filter(id=>!attackSupplied(s,s.units.find(u=>u.id===id)));
    if (ids.length) {
      s.campaign.unsupplied=ids;
      s.phase='supply-retreat';
      return;
    }
  }
  const needed=contacts(s);
  if (!needed.a.length) {
    note(s,name(s.active)+' completed movement · no engagements.');
    endSide(s,rng);
    return;
  }
  if (!suggestBattles(s)) {
    const forced=s.phase==='nuclear'||s.phase==='intercept'||s.phase==='supply-retreat';
    if (forced&&!allowDeadlock) { s.phase='contact-review'; return; }
    check(allowDeadlock&&(s.inheritedDeadlock||forced||s.phase==='contact-review'),'There is no legal grouping for every contact. Adjust movement before committing.');
    const plan=suggestBattles(s,[],true);
    const covered=new Set(plan.flatMap(g=>[...g.a,...g.d]));
    s.combatExempt=[...needed.a,...needed.d].filter(id=>!covered.has(id));
    note(s,'Forced-combat deadlock · '+s.combatExempt.join(', ')+' exempt. All other contacts must be assigned.');
    if (!plan.length) { endSide(s,rng); return; }
  }
  s.phase='plan';
  note(s,name(s.active)+' locked movement · '+needed.a.length+' engaged attackers and '+needed.d.length+' defenders.');
}

function launch(s,who,a,rng) {
  check(s.phase==='nuclear'&&['rocket','icbm'].includes(a.kind),'Choose an available nuclear weapon.');
  const board=boardOf(s), allowed=nuclearTargets(s,who,a.kind);
  const to=allowed.find(h=>h.id===a.to);
  check(to,'Choose a target in launcher range.');
  const candidates=s.optional.abm||s.mode==='solo'?[to.id]:[to.id,...(Array.isArray(a.decoys)?a.decoys:[])];
  if (candidates.length>1) check(candidates.length===3&&new Set(candidates).size===3&&
    candidates.every(id=>board.cells[id]&&candidates.every(other=>distance(board.cells[id],board.cells[other])<=3)),
  'Choose two different decoys within three hexes of one another and the target.');
  else check(s.optional.abm||s.mode==='solo','Choose two decoy hexes.');
  const r=choices(s,who), d=choices(s,enemy(who));
  r[a.kind]--;
  if (s.optional.pariah&&r.spentNukes<3) {
    const heavy=a.kind==='icbm';
    if (s.optional.replacement==='factors') d.rf+=(heavy?[8,4,2]:[6,3,1])[r.spentNukes];
    else d.bonus+=(heavy?[2,2,1]:[1,1,0])[r.spentNukes];
  }
  r.spentNukes++;
  s.campaign.pending={kind:a.kind,real:to.id,candidates:candidates.toSorted()};
  if (s.mode==='solo'&&!s.optional.abm) resolveStrike(s,roll(rng)>=5);
  else s.phase='intercept';
}
function resolveStrike(s,intercepted) {
  const c=s.campaign, p=c.pending;
  if (intercepted) {
    note(s,p.kind.toUpperCase()+' intercepted.');
    delete c.pending;
    s.phase='nuclear';
  } else if (p.kind==='icbm') {
    s.phase='nuclear-blast';
  } else applyStrike(s,[p.real]);
}
function applyStrike(s,blast) {
  const c = s.campaign, p = c.pending;
  for (const id of blast) {
    c.strikes[id]=s.active;
    for (const u of unitsAt(s,id)) eliminate(s,u);
  }
  note(s,p.kind.toUpperCase()+' strike hit '+blast.map(id=>hexAt(s,id).label).join(', ')+'.');
  delete c.pending;
  s.phase='nuclear';
}
function rollABM(points,d6) {
  const row=points<4?0:points<=6?1:points<=9?2:points<=12?3:4;
  return !charts.abmHit[row][d6-1];
}

const publicOffers={ban:'Nuclear ban',exchange:'Prisoner exchange',deescalate:'De-escalation'};
export const peaceOffers=publicOffers;
function releaseExchange(s,weak,strong,ratio) {
  const groups = [s.units.filter(u=>u.pow===strong),s.units.filter(u=>u.pow===weak)];
  const plans = group=> {
    const byCF=new Map([[0,[]]]);
    for (const u of group) for (const [cf,list] of [...byCF]) if (!byCF.has(cf+u.cf)) byCF.set(cf+u.cf,[...list,u]);
    return byCF;
  };
  const returnedToWeak=plans(groups[0]), returnedToStrong=plans(groups[1]);
  const total=Math.max(0,...[...returnedToWeak.keys()].filter(cf=>returnedToStrong.has(cf*ratio)));
  for (const u of [...returnedToWeak.get(total),...returnedToStrong.get(total*ratio)]) {
    delete u.pow;
    u.released=true;
    u.releaseTurn=s.turn;
  }
}
function resolvePeace(s,response) {
  const c=s.campaign, p=c.pending, A=s.active, D=enemy(A), a=choices(s,A), d=choices(s,D);
  const cf = side=>strength(s,side)+(s.optional.countNuclear?choices(s,side).rocket+3*choices(s,side).icbm:0);
  const S=cf(A)>=cf(D)?A:D, W=enemy(S);
  const deal={id:++c.serial,start:s.turn, label:publicOffers[p.offer]+' / '+response};
  const destroy=r=>{r.rocket=0;r.icbm=0;};
  if (p.offer==='ban') {
    if (response==='A') { destroy(d); deal.cease=sides; deal.withdraw=A; }
    if (response==='B') { destroy(a); destroy(d); deal.ban=sides; a.log++; a.peaceLog=(a.peaceLog??0)+1; if(D===S){d.log++;d.peaceLog=(d.peaceLog??0)+1;} }
    if (response==='C') {
      const [small,large]=a.rocket+a.icbm<=d.rocket+d.icbm?[a,d]:[d,a];
      for (const k of ['rocket','icbm']) { large[k]=Math.max(0,large[k]-small[k]); small[k]=0; }
      deal.ban=sides;
    }
  } else if (p.offer==='exchange') {
    if (response!=='D') releaseExchange(s,W,S,{A:2,B:1.5,C:1}[response]);
    if (response==='A') { const amount=A===S?2:1; a.log+=amount; a.peaceLog=(a.peaceLog??0)+amount; }
    if (response==='C') {deal.noSpecial=[W];deal.ends=s.turn+1;}
  } else {
    if (response==='A') c.deals=[];
    if (response==='B') {deal.cease=sides;deal.immobile=[W];deal.ends=s.turn+2;}
    if (response==='C') {
      deal.noRF=[A];deal.noAir=A===W?[A]:[];deal.resourceEnds=s.turn+2;
      deal.minLog=[A];d.rf=0;
    }
    if (response==='D') {deal.removeUnit=[A];deal.noRF=[D];deal.noAir=[D];}
  }
  if (['cease','ban','noSpecial','minLog','removeUnit'].some(key=>deal[key])) c.deals.push(deal);
  note(s,deal.label+' · terms resolved.');
  s.phase=p.resume;
  if (['plan','nuclear','battle-review'].includes(s.phase)&&!combatAllowed(s,A)) s.phase='treaty-pause';
  delete c.pending;
}

export function campaignEntryHexes(s,u,kind) {
  const side=u.side;
  const board=boardOf(s);
  const cells = kind==='release' ? (typeof u.released==='string'?[board.cells[u.released]]:capital(s,side)) :
    friendlyCities(s,side);
  return cells.filter(h=>canEnter(u,h,s)&&openFor(s,u,h.id)).map(h=>h.id);
}
export function airliftHexes(s,u) {
  if (!s.optional?.airlift || !u.pos || u.pos!==u.start || u.spent || u.special || u.fort ||
      s.weather==='snow' || !movementAllowed(s,u.side) || choices(s,u.side).air<Math.ceil(u.cf/2)) return [];
  const origin=hexAt(s,u.pos);
  if (origin.terrain!=='city'||home(s,origin)!==u.side) return [];
  const danger=zone(s,enemy(u.side));
  return friendlyCities(s,u.side).filter(h=>h.id!==u.pos&&!danger.has(h.id)&&
    (h.home===u.side||s.captured[h.id]===u.side)&&openFor(s,u,h.id)&&!damaged(s,h.id)).map(h=>h.id);
}
export function canFortify(s,u) {
  if (!u?.pos||!s.optional?.fort||u.type==='LOG'||!['deploy','move'].includes(s.phase)) return false;
  if (s.phase==='move'&&(u.start!==u.pos||u.spent||u.special||u.fortChanged||zone(s,enemy(u.side)).has(u.pos))) return false;
  if (u.fort) {
    if (u.fort==='position'&&unitsAt(s,u.pos).filter(v=>v.type!=='LOG').length>(s.optional.stacking?2:1)) return false;
    return true;
  }
  if (s.optional.fort==='position') return !unitsAt(s,u.pos).some(v=>v.fort==='position');
  return u.type==='IN' && unitsAt(s,u.pos).filter(v=>v.type!=='LOG'&&v.fort!=='position').length===1 &&
    pieces(s,u.side).filter(v=>v.fort==='dug').length<(u.side==='R'?4:2);
}
const fullStrength = u=>u.fullCF ?? (u.reduced ? (u.side==='B'&&u.cf===1?3:u.cf*2):u.cf);
function restore(u) {
  if (!u.reduced) return;
  u.cf=fullStrength(u);
  u.mf=u.fullMF??u.mf+1;
  if (u.fullRange) {u.range=u.fullRange;delete u.fullRange;}
  if (u.fullRemote) u.remote=u.fullRemote;
  u.reduced=false;
}
export function refitSupplyChoices(s,u) {
  const points = [];
  if (supplyPath(s,u,Infinity,false)) points.push(['installation','Supply installation']);
  if (s.optional?.supply==='logistics') for (const point of pieces(s,u.side).filter(v=>v.type==='LOG')) {
    if (supplyPath(s,u,Infinity,true,point.id)) points.push([point.id,point.id+' · logistic unit']);
  }
  return points;
}
export function canRefit(s,u) {
  return !!(s.optional?.refit&&u?.pos&&u.reduced&&!u.spent&&!u.special&&u.pos===u.start&&!u.refit&&
    !zone(s,enemy(u.side)).has(u.pos)&&refitSupplyChoices(s,u).length&&choices(s,u.side).rf>=fullStrength(u)-u.cf);
}
function spawnLogistic(s,who,to) {
  s.units.push({id:who+'L'+(++s.campaign.serial),n:'L',corps:'LOG',type:'LOG',side:who,cf:0,mf:10,
    pos:to,start:to,spent:0,dead:false,stopped:zone(s,enemy(who)).has(to)});
}
export function applyCampaignAction(s,who,a,rng) {
  if (!s.campaign) return false;
  const c=s.campaign, o=s.optional, r=choices(s,who), u=s.units.find(v=>v.id===a.unit);
  const to=hexAt(s,a.to);
  const movable=s.phase==='move'&&movementAllowed(s,who);
  switch (a.type) {
    case 'fortify':
      check(u?.side===who&&canFortify(s,u),'That division cannot change its fortification.');
      if (u.fort) delete u.fort;
      else u.fort=o.fort;
      if (s.phase==='move') {u.stopped=true;u.fortChanged=true;}
      note(s,u.id+(u.fort?' fortified its position.':' dismantled its fortification.'));
      break;
    case 'set-camp': {
      check(s.phase==='deploy'&&o.alternatePow&&to?.home===who&&to.terrain==='clear','Place the alternate camp in a clear home hex.');
      c.sites.find(m=>m.kind==='pow'&&m.side===who).pos=to.id;
      break;
    }
    case 'rebuild': {
      check(movable&&o.replacement&&u?.side===who&&u.dead&&u.type!=='LOG','Choose an eliminated division for replacement.');
      const cost=fullStrength(u);
      if (o.replacement==='factors') {check(r.rf>=cost,'Insufficient replacement factors.'); r.rf-=cost;}
      else {check(r.replacement>0,'No replacement unit is available.');r.replacement--;}
      restore(u);u.dead=false;u.rebuilt=true;
      note(s,u.id+' entered the replacement pool.');
      break;
    }
    case 'replacement-entry':
    case 'release-entry': {
      const release=a.type==='release-entry';
      check(movable&&u?.side===who&&(release?u.released&&u.releaseTurn<=s.turn:u.rebuilt)&&
        campaignEntryHexes(s,u,release?'release':'replacement').includes(to?.id),'Choose an eligible reserve and city hex.');
      if (release) {delete u.released;delete u.releaseTurn;}
      else delete u.rebuilt;
      place(s,u,to.id);
      u.start=null;u.spent=0;u.stopped=zone(s,enemy(who)).has(to.id);
      note(s,u.id+' arrived at '+to.label+'.');
      break;
    }
    case 'airlift':
      check(movable&&u?.side===who&&airliftHexes(s,u).includes(to?.id),'Choose an eligible airlift and destination.');
      r.air-=Math.ceil(u.cf/2);u.special=true;
      relocate(s,u,[to.id],'airlift');
      note(s,u.id+' airlifted to '+to.label+'.');
      break;
    case 'refit': {
      check(movable&&u?.side===who&&canRefit(s,u),'This division cannot rest and refit.');
      const available = refitSupplyChoices(s,u);
      const supply = a.supply ?? available[0][0];
      check(available.some(([id])=>id===supply),'Choose a valid source for refit.');
      r.rf-=fullStrength(u)-u.cf;
      if (supply!=='installation') eliminate(s,s.units.find(v=>v.id===supply));
      u.refit=true;u.stopped=true;
      note(s,u.id+' is resting and refitting.');
      break;
    }
    case 'logistic-entry': {
      check(movable&&(o.supply==='logistics'||o.peace)&&r.log>0&&to&&!damaged(s,to.id)&&
        (supplyCenter(s,who).some(m=>m.pos===to.id)||
          (treaty(s,'minLog',who)||r.peaceLog>0)&&!supplyCenter(s,who).length&&to.terrain!=='sea')&&
        unitAt(s,to.id)?.side!==enemy(who)&&!zone(s,enemy(who)).has(to.id),'Choose an available friendly supply installation.');
      r.log--;
      if (r.peaceLog>0) r.peaceLog--;
      spawnLogistic(s,who,to.id);
      break;
    }
    case 'logistic-policy':
      check(movable&&(o.supply==='logistics'||o.peace),'Logistic capture policy is unavailable.');
      c.captureMode[who]=a.convert===true;
      break;
    case 'third-supply':
      check(movable&&r.thirdSupply&&!r.builtSupply&&to?.terrain==='city'&&home(s,to)===who&&
        !c.sites.some(m=>m.kind==='supply'&&m.pos===to.id),'Choose a friendly city for the new installation.');
      c.sites.push({kind:'supply',side:who,pos:to.id});r.builtSupply=true;
      break;
    case 'supply-retreat': {
      check(s.phase==='supply-retreat'&&u?.side===who&&c.unsupplied.includes(u.id),'Choose an unsupplied attacker.');
      const targets=paths(s,u,'retreat',1);
      if (Object.keys(targets).length) {
        check(to&&targets[to.id],'Choose a legal one-hex retreat.');
        relocate(s,u,targets[to.id].route,'retreat');
      } else eliminate(s,u);
      c.unsupplied=c.unsupplied.filter(id=>id!==u.id);
      if (!c.unsupplied.length) beginGroundCombat(s,rng,c.allowDeadlock);
      break;
    }
    case 'review-contacts':
      check(s.phase==='contact-review','No engagement ruling is pending.');
      beginGroundCombat(s,rng,true);
      break;
    case 'battle-support': {
      check(s.phase==='battle-support','Support has already been locked.');
      const support=a.artillery??[];
      const allowed=artilleryAvailable(s).map(v=>v.id);
      const air=Number(a.air??0);
      check(Array.isArray(support)&&new Set(support).size===support.length&&support.every(id=>allowed.includes(id))&&
        Number.isInteger(air)&&air>=0&&air<=Math.min(r.air,o.air==='ground'?1:Infinity)&&(!air||o.air&&s.weather!=='snow'),
        'Choose available artillery and air factors.');
      spendBattleSupply(s,a.supplyByUnit);
      s.battle.support=support;
      for (const id of support) s.units.find(v=>v.id===id).fired=true;
      r.air-=air;
      s.battle.air=air;
      s.battle.odds=battleOdds(s,s.battle.a,s.battle.d,support,o.air==='ground'?0:air,o.air==='ground'?air:0);
      if (air&&hasCAP(o)&&choices(s,enemy(who)).air) s.phase='air-cap';
      else startTactics(s,rng);
      break;
    }
    case 'air-cap': {
      const air=Number(a.air??0), b=s.battle;
      check(s.phase==='air-cap'&&Number.isInteger(air)&&air>=0&&air<=Math.min(r.air,b.air),'Choose available CAP factors.');
      r.air-=air;b.air-=air;
      b.odds=battleOdds(s,b.a,b.d,b.support,b.air);
      startTactics(s,rng);
      break;
    }
    case 'surrender':
    case 'pass-pow':
      check(s.phase==='surrender','Surrender is unavailable.');
      if (a.type==='surrender') surrender(s);
      else s.phase='tactics';
      break;
    case 'prison-break': {
      const prisoners=s.units.filter(v=>v.pow===enemy(who));
      const camp=c.sites.find(m=>m.kind==='pow'&&m.side===enemy(who));
      check(movable&&o.prisonBreak&&!r.breakTried&&prisoners.length&&camp&&!unitAt(s,camp.pos)&&
        pieces(s,who).every(v=>!v.spent&&!v.special),'A prison break is unavailable.');
      r.breakTried=true;
      const row=Math.min(4,Math.floor((prisoners.length-1)/2));
      const fails=charts.prisonBreakFails?.[row]?.[roll(rng)-1];
      if (fails) {const p=prisoners.find(v=>v.id===a.unit)??prisoners[0];delete p.pow;eliminate(s,p);note(s,p.id+' was lost in the prison break.');}
      else {freePrisoners(s,enemy(who));if (o.alternatePow) for (const p of prisoners) p.releaseTurn=s.turn;note(s,'The prisoners escaped.');}
      break;
    }
    case 'build-nuclear': {
      check(movable&&o.nuclear&&s.turn>=2&&['rocket','icbm'].includes(a.kind)&&!treaty(s,'ban',who)&&
        c.sites.some(m=>m.kind===a.kind&&m.side===who&&isLiveSite(s,m)), 'Production requires an intact launcher and permitted preparation.');
      const heavy=a.kind==='icbm';
      const rf=Number(a.rf??0), cost=heavy?6:3;
      check((heavy?s.turn-r.lastICBM>=3:s.turn!==r.lastRocket)&&Number.isInteger(rf)&&rf>=0&&rf<=cost&&
        r.rf>=rf&&r.air>=cost-rf, 'Insufficient resources or the production interval has not elapsed.');
      r.rf-=rf;r.air-=cost-rf;r[a.kind]++;
      if (heavy) r.lastICBM=s.turn;
      else r.lastRocket=s.turn;
      note(s,name(who)+' produced a '+a.kind.toUpperCase()+'.');
      break;
    }
    case 'discard-nuclear':
      check(o.nuclear&&s.active===who&&['move','plan','nuclear','battle-review'].includes(s.phase)&&
        ['rocket','icbm'].includes(a.kind)&&r[a.kind]>0,'There is no weapon to discard.');
      r[a.kind]--;
      break;
    case 'nuclear-strike': launch(s,who,a,rng); break;
    case 'intercept': {
      check(s.phase==='intercept','No strike is pending.');
      const pending=c.pending;
      if (o.abm) {
        const points=Number(a.points??0);
        check(Number.isInteger(points)&&points>=0&&points<=r.abm,'Choose available ABM points.');
        r.abm-=points;
        resolveStrike(s,rollABM(points,roll(rng)));
      } else {
        check(pending.candidates.includes(a.to),'Choose a suspected strike hex.');
        resolveStrike(s,pending.real===a.to);
      }
      break;
    }
    case 'nuclear-blast': {
      check(s.phase==='nuclear-blast','No ICBM blast is pending.');
      const target=hexAt(s,c.pending.real);
      check(Array.isArray(a.blast)&&a.blast.length===2&&a.blast[0]!==a.blast[1]&&a.blast.every(id=>target.adj.includes(id)),
        'Choose two different hexes adjacent to the ICBM target.');
      applyStrike(s,[target.id,...a.blast]);
      break;
    }
    case 'end-nuclear':
      check(s.phase==='nuclear','Nuclear strikes are already locked.');
      beginGroundCombat(s,rng,c.allowDeadlock);
      break;
    case 'peace-offer':
      check(o.peace&&s.active===who&&r.peace>0&&['move','plan','battle-review','nuclear'].includes(s.phase)&&
        Object.hasOwn(publicOffers,a.offer),'Choose an available peace offer.');
      r.peace--;
      c.pending={resume:s.phase,offer:a.offer};
      if (s.mode==='solo') {
        const die=roll(rng);
        resolvePeace(s,['A','B','C','D','D','A'][die-1]);
      } else s.phase='peace-response';
      break;
    case 'peace-response':
      check(s.phase==='peace-response'&&['A','B','C','D'].includes(a.response),'Choose a counteroffer.');
      resolvePeace(s,a.response);
      break;
    case 'break-treaty': {
      const deal=c.deals.find(v=>v.id===a.deal);
      const units=Array.isArray(a.units)?pieces(s,who).filter(v=>v.type!=='LOG'&&a.units.includes(v.id)):[];
      check(o.peace&&s.active===who&&['move','plan','nuclear','battle-review'].includes(s.phase)&&deal&&s.turn>=deal.start+3&&
        units.reduce((sum,v)=>sum+v.cf,0)>=8,'Breaking this agreement requires three turns and at least 8 CF in defections.');
      units.forEach(v=>eliminate(s,v));
      c.deals=c.deals.filter(v=>v!==deal);
      note(s,name(who)+' broke '+deal.label+'.');
      if (s.phase==='plan') {s.battles=[];beginGroundCombat(s,rng,false);}
      break;
    }
    case 'withdraw-treaty-unit':
      check(s.phase==='move'&&r.removeDue&&u?.pos&&u.side===who&&u.type!=='LOG','Choose a division to remove under the agreement.');
      u.pos=null;r.removeDue=false;
      break;
    case 'end-treaty-pause':
      check(s.phase==='treaty-pause','No ceasefire is pending.');
      endSide(s,rng);
      break;
    default: return false;
  }
  return true;
}

export function logisticEntryHexes(s,side) {
  const sites=supplyCenter(s,side), danger=zone(s,enemy(side));
  const extra=(treaty(s,'minLog',side)||choices(s,side).peaceLog>0)&&!sites.length;
  return Object.values(boardOf(s).cells).filter(h=>(sites.some(site=>site.pos===h.id)||extra&&h.terrain!=='sea')&&
    !damaged(s,h.id)&&unitAt(s,h.id)?.side!==enemy(side)&&!danger.has(h.id));
}
export function nuclearBuildCosts(s,side,kind) {
  const r=choices(s,side);
  const cost=kind==='icbm'?6:3;
  if (s.turn<2||treaty(s,'ban',side)||!s.campaign.sites.some(m=>m.side===side&&m.kind===kind&&isLiveSite(s,m))||
      (kind==='icbm'?s.turn-r.lastICBM<3:s.turn===r.lastRocket)) return [];
  return Array.from({length:cost+1},(_,rf)=>rf).filter(rf=>rf<=r.rf&&cost-rf<=r.air);
}
export function canBreakPrison(s,side) {
  if (!s.optional?.prisonBreak || !movementAllowed(s,side) || choices(s,side).breakTried) return false;
  const camp=s.campaign.sites.find(m=>m.kind==='pow'&&m.side===enemy(side));
  return camp&&!unitAt(s,camp.pos)&&s.units.some(u=>u.pow===enemy(side))&&pieces(s,side).every(u=>!u.spent&&!u.special);
}
