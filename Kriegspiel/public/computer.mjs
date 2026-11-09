import {
  act, actor, advanceMF, advanceUnits, attackTactics, battleOdds, boardOf, combatResult, contacts, enemy, lossCost, paths, pieces, quota, reinforcementHexes,
  reserve, retreatMF, specialHexes, strength, suggestBattles, unitAt, withdrawalUnits
} from './game.mjs';
import { airliftHexes, artilleryAvailable, attackSupplied, campaignEntryHexes, canRefit, logisticEntryHexes,
  movementAllowed, nuclearTargets } from './campaign.mjs';

const distance = (a,b) => Math.max(Math.abs(a.c-b.c),(Math.abs(a.c-b.c)+Math.abs(a.y-b.y))/2);
const best = (values,score) => values.reduce((winner,item) => !winner || score(item)>score(winner) ? item : winner,null);

function positionScorer(s,side) {
  const board = boardOf(s);
  const own = pieces(s,side).filter(u=>u.type!=='LOG');
  const opposition = pieces(s,enemy(side)).filter(u=>u.type!=='LOG');
  const veteran = s.difficulty==='veteran';
  const cities = board.cities[enemy(side)].flat().filter(id=>unitAt(s,id)?.side!==side);
  const goals = (cities.length ? cities : board.cities[enemy(side)].flat()).map(id=>board.cells[id]);
  return (unit,id) => {
    const hex = board.cells[id];
    const progress = Math.min(...goals.map(target=>distance(hex,target)));
    const support = own.filter(u=>u.id!==unit.id && hex.adj.includes(u.pos)).reduce((sum,u)=>sum+u.cf,0);
    const threat = opposition.filter(u=>hex.adj.includes(u.pos)).reduce((sum,u)=>sum+u.cf,0);
    const cover = s.terrain && ['city','mountain','woods','river'].includes(hex.terrain);
    const city = hex.terrain==='city' && hex.home!==side ? 5 : hex.cap===side ? 1.4 : 0;
    if (unit.type==='LOG') return -progress*.28+Math.min(support,18)*.18-threat*.3;
    const garrison = veteran&&hex.cap===side&&opposition.some(e=>distance(hex,board.cells[e.pos])<=e.mf+1) ? 4 : 0;
    const engagement = threat ? (unit.cf+support*.55>=threat*1.2 ? .85 : -2.4) : 0;
    return -.58*progress + Math.min(support,12)*.085 + (cover ? .48 : 0) + city + engagement + garrison;
  };
}

function movement(s,side) {
  if (!movementAllowed(s,side)) return {type:'end-move'};
  const score = positionScorer(s,side);
  const preparation = prepare(s,side,score);
  if (preparation) return preparation;
  if (s.credit[side]) {
    for (const u of reserve(s,side).sort((a,b)=>b.cf-a.cf || b.mf-a.mf)) {
      const target = reinforcementHexes(s,side,u).map(id=>({id,value:score(u,id)})).sort((a,b)=>b.value-a.value)[0];
      if (target) return {type:'reinforce',unit:u.id,to:target.id};
    }
  }

  const options = [];
  const units = pieces(s,side);
  const canFinish = suggestBattles(s) !== null;
  for (const u of units) {
    if (canFinish && (u.spent || u.special || (u.start && u.start!==u.pos))) continue;
    const from = score(u,u.pos);
    for (const [id,path] of Object.entries(paths(s,u))) {
      options.push({ type:'move', unit:u.id, to:id, value:score(u,id)-from-path.cost*.01 });
    }
    for (const id of Object.keys(specialHexes(s,u))) {
      if (unitAt(s,id)) continue;
      options.push({ type:'special', unit:u.id, to:id, value:score(u,id)-from-.35 });
    }
  }
  options.sort((a,b)=>b.value-a.value);

  const veteran = s.difficulty==='veteran';
  const recruit = s.difficulty==='recruit';
  const baseline = veteran&&canFinish ? battleValue(s,suggestBattles(s)) : 0;
  const currentContacts = contacts(s);
  let selected = null;
  let highest = .17;
  let legal = 0;
  for (const {value,...action} of options) {
    if (canFinish && value<(veteran?-1.25:.17)) break;
    const trial = structuredClone(s);
    act(trial,side,action);
    const battles = suggestBattles(trial);
    if (battles) {
      if (!veteran || !canFinish) return action;
      const evaluation = value + battleValue(trial,battles)-baseline;
      if (evaluation>highest) { highest=evaluation; selected=action; }
      if (++legal>=22) break;
      continue;
    }
    if (recruit && canFinish && value<1) break;
    if (!canFinish) {
      const next = contacts(trial);
      if (next.a.length+next.d.length < currentContacts.a.length+currentContacts.d.length) return action;
    }
  }
  if (selected) return selected;
  return {type:!canFinish && s.inheritedDeadlock?'resolve-deadlock':'end-move'};
}

function minimumLoss(s,units,minimum) {
  const plans = new Map([[0,{ entries:[], removed:0 }]]);
  for (const u of units) {
    for (const [cf,plan] of [...plans]) {
      for (const kind of ['reduce','eliminate']) {
        const cost = lossCost(s,u,kind);
        if (!cost) continue;
        const total = cf+cost;
        const removed = plan.removed + Number(kind==='eliminate');
        if (!plans.has(total) || removed<plans.get(total).removed) {
          plans.set(total,{ entries:[...plan.entries,{id:u.id,kind}], removed });
        }
      }
    }
  }
  const total = Math.min(...[...plans.keys()].filter(cf=>cf>=minimum));
  return { total, entries:plans.get(total)?.entries ?? [] };
}

function prepare(s,side,score) {
  const c = s.campaign;
  if (!c) return null;
  const r = c.stock[side];
  const own = s.units.filter(u=>u.side===side&&u.type!=='LOG');
  if (r.removeDue) {
    const u = best(own.filter(v=>v.pos),v=>-v.cf);
    if (u) return {type:'withdraw-treaty-unit',unit:u.id};
  }
  for (const u of own) {
    const kind = u.rebuilt?'replacement':u.released&&u.releaseTurn<=s.turn?'release':null;
    if (!kind) continue;
    const to = best(campaignEntryHexes(s,u,kind),id=>score(u,id));
    if (to) return {type:kind+'-entry',unit:u.id,to};
  }
  const rebuild = best(own.filter(u=>u.dead&&(s.optional.replacement==='units'&&r.replacement>0||
    s.optional.replacement==='factors'&&r.rf>=(u.fullCF??u.cf))),u=>u.fullCF??u.cf);
  if (rebuild) return {type:'rebuild',unit:rebuild.id};
  if (r.thirdSupply&&!r.builtSupply) {
    const to = Object.values(boardOf(s).cells).find(h=>h.terrain==='city'&&(s.control[h.id]??h.home)===side&&
      !c.sites.some(m=>m.kind==='supply'&&m.pos===h.id));
    if (to) return {type:'third-supply',to:to.id};
  }
  if (r.log>0 && pieces(s,side).filter(u=>u.type==='LOG').length<2) {
    const to = best(logisticEntryHexes(s,side).filter(h=>!s.units.some(u=>u.type==='LOG'&&u.pos===h.id)),
      h=>score({type:'LOG'},h.id));
    if (to) return {type:'logistic-entry',to:to.id};
  }
  if (s.difficulty==='veteran') {
    const refit = best(own.filter(u=>canRefit(s,u)),u=>(u.fullCF??u.cf)-u.cf);
    if (refit) return {type:'refit',unit:refit.id};
    for (const u of own) {
      const to = best(airliftHexes(s,u),id=>score(u,id));
      if (to && score(u,to)>score(u,u.pos)+4) return {type:'airlift',unit:u.id,to};
    }
  }
  return null;
}

function casualtyValue(s,units,code) {
  if (!code) return 0;
  const all = units.reduce((sum,u)=>sum+u.cf,0);
  const kind = code[1];
  if (kind==='E') return all;
  if (kind==='S') return Math.min(...units.map(u=>u.reduced?u.cf:Math.max(1,lossCost(s,u,'reduce'))));
  if (kind==='R') return units.reduce((sum,u)=>sum+(!Object.keys(paths(s,u,'retreat',Number(code[2]))).length ? u.cf : .4),0);
  return Number.isFinite(Number(kind)) ? Math.min(all,minimumLoss(s,units,Number(kind)).total) : 0;
}

function battleChoices(s,b) {
  const attack = b.a.map(id=>s.units.find(u=>u.id===id));
  const defense = b.d.map(id=>s.units.find(u=>u.id===id));
  const key = defense.some(u=>boardOf(s).cells[u.pos].terrain==='city');
  const veteran = s.difficulty==='veteran';
  return attackTactics(b).map(a=>({a,values:retreatMF.map((distance,d)=>{
    const codes = (combatResult(b,a,d) ?? '').split(' ');
    if (codes.includes('EX')) return -.18*Math.min(b.odds.attack,b.odds.defend);
    let own = codes.filter(code=>code.startsWith('A')).reduce((sum,code)=>sum+casualtyValue(s,attack,code),0);
    let other = codes.filter(code=>code.startsWith('D')).reduce((sum,code)=>sum+casualtyValue(s,defense,code),0);
    if (!b.odds.alternate && distance && !codes.includes('DE')) other += casualtyValue(s,defense,'DR'+distance);
    const move = b.odds.alternate?codes.some(code=>code.startsWith('AA')):
      advanceMF[a]&&!codes.includes('AE')&&(distance||codes.includes('DE'));
    if (attack.some(u=>u.landing)&&!move) own += 5;
    return other-own*(veteran?1.32:1)+(move?(key?1.8:.55):0);
  })}));
}

function battleValue(s,battles) {
  let score = 0;
  for (const g of battles) {
    const b = {...g,odds:battleOdds(s,g.a,g.d)};
    const values = battleChoices(s,b).map(({values})=>values.reduce((sum,v)=>sum+v,0)/values.length+.25*Math.min(...values));
    score += .55*Math.max(...values);
    score -= g.a.filter(id=>!attackSupplied(s,s.units.find(u=>u.id===id))).length*2.5;
  }
  return score;
}

function tactic(s) {
  const b = s.battle;
  if (s.difficulty==='recruit') {
    const choices = attackTactics(b);
    return {type:'choose-tactic',choice:b.locked?2:choices.at(-1)};
  }
  const choices = battleChoices(s,b);
  const sideValue = outcomes=>outcomes.reduce((sum,v)=>sum+v,0)/outcomes.length+
    Math.min(...outcomes)*(s.difficulty==='veteran'?.32:.14);
  if (b.locked) {
    const defense = retreatMF.map((_,d)=>({d,values:choices.map(item=>-item.values[d])}));
    return {type:'choose-tactic',choice:best(defense,item=>sideValue(item.values)).d};
  }
  return {type:'choose-tactic',choice:best(choices,item=>sideValue(item.values)).a};
}

function route(s,side,u,kind,mf) {
  const score = positionScorer(s,u.side);
  return best(Object.keys(paths(s,u,kind,mf)),to=>score(u,to)*(u.side===side?1:-1));
}

function strike(s,side) {
  const options = [];
  for (const kind of ['rocket','icbm']) for (const h of nuclearTargets(s,side,kind)) {
    const victim = unitAt(s,h.id);
    if (!victim || victim.side===side || h.adj.length<2) continue;
    const value = id=>{
      const u = unitAt(s,id);
      return u ? u.cf*(u.side===side?-2:1) : 0;
    };
    const nearby = [...h.adj].sort((a,b)=>value(b)-value(a));
    const blast = kind==='icbm'?nearby.slice(0,2):[];
    options.push({type:'nuclear-strike',kind,to:h.id,decoys:nearby.slice(-2),blast,
      value:value(h.id)+blast.reduce((sum,id)=>sum+value(id),0)-(kind==='icbm'?3:0)});
  }
  const pick = best(options,item=>item.value);
  return pick?.value>=7 ? pick : {type:'end-nuclear'};
}

export function computerAction(s,side) {
  if (actor(s)!==side) return null;
  const b = s.battle;
  const get = id => s.units.find(u=>u.id===id);
  const r = s.campaign?.stock[side];
  switch (s.phase) {
    case 'map-choice': return {type:'map-config',layout:s.layout==='short'?'short':'standard',rotate:s.rotations[side]};
    case 'battle-support': return {type:'battle-support',artillery:artilleryAvailable(s).map(u=>u.id),
      air:s.weather==='snow'||!s.optional.air?0:Math.min(r.air,s.optional.air==='ground'?1:Math.max(0,b.odds.defend*2-b.odds.attack))};
    case 'air-cap': return {type:'air-cap',air:Math.min(r.air,b.air)};
    case 'surrender': return {type:'pass-pow'};
    case 'nuclear': return s.difficulty==='veteran'?strike(s,side):{type:'end-nuclear'};
    case 'nuclear-blast': {
      const target=boardOf(s).cells[s.campaign.pending.real];
      const value=id=>{
        const u=unitAt(s,id);
        return u?u.cf*(u.side===side?-2:1):0;
      };
      return {type:'nuclear-blast',blast:[...target.adj].sort((a,b)=>value(b)-value(a)).slice(0,2)};
    }
    case 'intercept': return s.optional.abm ? {type:'intercept',points:Math.min(r.abm,13)} :
      {type:'intercept',to:best(s.campaign.pending.candidates,id=>unitAt(s,id)?.side===side?unitAt(s,id).cf:0)};
    case 'peace-response': return {type:'peace-response',response:strength(s,side)<strength(s,enemy(side))?'B':'D'};
    case 'hold-ground': return {type:'hold-ground',units:[]};
    case 'supply-retreat': {
      const u = get(s.campaign.unsupplied[0]);
      return {type:'supply-retreat',unit:u.id,to:route(s,side,u,'retreat',1)};
    }
    case 'crt-route': {
      const op = b.operations[0], u = get(op.ids[0]);
      const to = route(s,side,u,op.kind,op.distance-Number(op.kind==='retreat'&&!!b.holding?.includes(u.id)));
      return {type:'crt-route',unit:u.id,to,skip:op.kind==='advance'&&!to};
    }
    case 'contact-review': return {type:'review-contacts'};
    case 'treaty-pause': return {type:'end-treaty-pause'};
    case 'deploy': return {type:pieces(s,side).length===quota(s,side)?'deploy-ready':'auto-deploy'};
    case 'move': return movement(s,side);
    case 'plan': {
      const remaining = suggestBattles(s,s.battles);
      return {type:remaining?.length?'auto-plan':'start-battles'};
    }
    case 'tactics': return tactic(s);
    case 'loss': {
      const loss = b.losses[0];
      const units = loss.ids.map(get).filter(u=>u.pos);
      if (loss.stepOnly) {
        const u = best(units,v=>-lossCost(s,v,v.reduced?'eliminate':'reduce'));
        return {type:'take-loss',losses:[{id:u.id,kind:u.reduced?'eliminate':'reduce'}]};
      }
      return {type:'take-loss',losses:minimumLoss(s,units,loss.minimum).entries};
    }
    case 'battle-review': return {type:'continue-battle'};
    case 'retreat-choice': return {type:'retreat-choice',retreat:true};
    case 'retreat': {
      const unit = get(b.retreat[0]);
      const defenderPosition = positionScorer(s,unit.side);
      const candidate = best(Object.keys(paths(s,unit,'retreat',retreatMF[b.def]-Number(!!b.holding?.includes(unit.id)))).map(to=>({to})),item=>-defenderPosition(unit,item.to));
      return {type:'retreat',unit:unit.id,to:candidate?.to};
    }
    case 'withdraw':
    case 'advance': {
      const withdraw = s.phase==='withdraw';
      const units = withdraw ? withdrawalUnits(s) : advanceUnits(s);
      const score = positionScorer(s,side);
      const choices = units.flatMap(unit=>Object.keys(paths(s,unit,withdraw?'retreat':'advance',
        withdraw?retreatMF[b.def]:advanceMF[b.off])).map(to=>({unit:unit.id,to,value:score(unit,to)-score(unit,unit.pos)})));
      const candidate = best(choices,item=>item.value);
      if (candidate && candidate.value>(withdraw?1.65:.12)) return {type:s.phase,unit:candidate.unit,to:candidate.to};
      return {type:withdraw?'end-withdraw':'end-battle'};
    }
    default: return null;
  }
}

