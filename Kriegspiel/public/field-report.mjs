import { act, boardOf, cityProgress, name, strength, offensive, defensive } from './game.mjs';

export const startRecord = game => ({version:1,initial:structuredClone(game),orders:[]});

function boardDescription(s) {
  const board = boardOf(s);
  return s.map+' / '+s.layout+' / '+board.halves.map(h=>h.side+' '+h.asset+' '+(h.rotate?'180°':'0°')).join(' → ');
}

function unitChange(old,u,hex) {
  if (!old) return [u.id+' + '+hex(u.pos),u.id+' entered at '+hex(u.pos)];
  const changes = [], details = [];
  if (old.pos!==u.pos) {
    changes.push(u.id+' '+hex(old.pos)+'>'+hex(u.pos));
    details.push(old.pos&&u.pos?u.id+' moved from '+hex(old.pos)+' to '+hex(u.pos):
      u.pos?u.id+' placed at '+hex(u.pos):u.id+' left '+hex(old.pos));
  }
  if (old.cf!==u.cf || old.mf!==u.mf) {
    changes.push(u.id+' '+old.cf+'/'+old.mf+'>'+u.cf+'/'+u.mf);
    details.push(u.id+' changed from '+old.cf+' CF / '+old.mf+' MF to '+u.cf+' CF / '+u.mf+' MF');
  }
  if (!old.dead&&u.dead) details.push(u.id+' was eliminated');
  if (old.pow!==u.pow) details.push(u.pow?u.id+' was taken prisoner':u.id+' was freed');
  return [changes.join(', '),details.join('. ')];
}

export function recordOrder(s,side,action,rng,apply) {
  const {turn,half,phase,battle,active} = s;
  const old = new Map(s.units.map(u=>[u.id,{...u}]));
  const oldNotes = [...s.log];
  const trails = s.trails?.at(-1);
  const cities = Object.fromEntries(['R','B'].map(f=>[f,cityProgress(s,f).secured]));
  const captured = {...s.captured};
  const draws = [];
  const result = apply(s,side,action,()=>{
    const value = rng();
    draws.push(value);
    return value;
  });
  const board = boardOf(s);
  const hex = id=>board.cells[id]?.label ?? (id ?? '—');
  const changes = s.units.map(u=>unitChange(old.get(u.id),u,hex));
  const detail = changes.map(change=>change[1]).filter(Boolean);
  let moves = changes.map(change=>change[0]).filter(Boolean);
  const route = s.trails?.at(-1) ?? (s.active!==side?s.lastTrails?.at(-1):undefined);
  if (route && route!==trails && route.unit===action.unit && route.path.length>1) {
    const path = route.path.map(hex);
    moves = [route.unit+' '+path.join('>'),...moves.filter(line=>!line.startsWith(route.unit+' '))];

  }
  if (action.type==='map-config') detail.push('Board configuration is '+boardDescription(s));
  const b = s.battle ?? battle;
  const engagement = b?.a && b?.d && {
    number:b.number??1, attackers:b.a.join(', '), defenders:b.d.join(', '),
    odds:b.odds.attack+':'+b.odds.defend
  };
  if (engagement && ['battle-support','air-cap'].includes(action.type)) detail.push('Combat strength is '+engagement.odds+' CF');
  if (action.type==='choose-tactic' && b) {
    const chosen = phase==='tactics' && side===s.active ? offensive[b.off] : defensive[b.def];
    if (chosen) detail.push(name(side)+' chose '+chosen);
  }
  if (action.type==='add-battle') detail.push(action.a.join(', ')+' attack '+action.d.join(', '));
  if (action.type==='peace-offer') detail.push(name(side)+' proposed '+action.offer);
  if (action.type==='peace-response') detail.push(name(side)+' chose counteroffer '+action.response);
  if (action.type==='nuclear-strike') detail.push(name(side)+' targeted '+hex(action.to)+' with a '+action.kind);
  if (action.type==='intercept') detail.push(action.to?name(side)+' intercepted at '+hex(action.to):
    name(side)+' spent '+(action.points??0)+' ABM points attempting interception');
  for (const id of board.cities.R.concat(board.cities.B).flat()) {
    if (s.captured[id]!==captured[id] && s.captured[id]) {
      const f=s.captured[id];
      const unit=s.units.find(u=>u.pos===id&&u.side===f&&u.type!=='LOG');
      detail.push(name(f)+' secured '+hex(id)+(unit?' with '+unit.id:''));
    }
  }
  for (const f of ['R','B']) {
    const progress=cityProgress(s,f);
    if (progress.secured!==cities[f]) detail.push(name(f)+' now holds '+progress.secured+'/'+progress.total+' secured enemy cities');
  }
  const end = oldNotes.length ? s.log.indexOf(oldNotes[0]) : s.log.length;
  detail.push(...s.log.slice(0,end<0?s.log.length:end).reverse());
  const args = Object.entries(action).filter(([k,v])=>k!=='type'&&v!=null&&(!Array.isArray(v)||v.length))
    .map(([k,v])=>k+'='+JSON.stringify(k==='to'?hex(v):v)).join(' ');
  s.record.orders.push({
    side,action:structuredClone(action),draws,turn,half,phase,active,engagement:engagement||null,
    notation:[(turn?turn+'.'+(half+1):'S')+side,action.type,args,moves.join(', ')].filter(Boolean).join(' · '),
    plain:detail.length?sentences(detail):''
  });
  return result;
}

function sentences(lines) {
  return [...new Set(lines.map(line=>line.trim().replace(/\.+$/,'')))].filter(Boolean)
    .map(line=>/[!?]$/.test(line)?line:line+'.').join(' ');
}

function orderSections(orders) {
  const lines = [];
  let halfTurn, battleNumber;
  for (const entry of orders) {
    const section = entry.turn+'.'+entry.half;
    if (section!==halfTurn) {
      halfTurn = section;
      battleNumber = null;
      lines.push('',entry.turn?'### Turn '+entry.turn+' · '+(entry.half===0?'First half':'Second half')+
        ' · '+name(entry.active??entry.side)+' attacking':'### Setup','');
    }
    const legacy = entry.plain.match(/Battle (\d+) pits ([^.]+?) against ([^.]+?) at (\d+:\d+) CF\./);
    const b = entry.engagement ?? (legacy && {number:Number(legacy[1]),attackers:legacy[2],defenders:legacy[3],odds:legacy[4]});
    if (b && b.number!==battleNumber) {
      battleNumber = b.number;
      lines.push('','#### Battle '+b.number+' · '+b.attackers+' vs '+b.defenders+' · '+b.odds+' CF','');
    }
    let plain = entry.plain.replace(/^[^.]+ issued [^.]+\.\s*/,'');
    if (legacy && !['battle-support','air-cap'].includes(entry.action.type)) plain = plain.replace(legacy[0]+' ','').replace(legacy[0],'');
    plain = plain.trim().replace(/\.{2,}/g,'.');
    lines.push('- **'+entry.notation+'**'+(plain?'  \n  '+plain:''));
  }
  return lines;
}

export function createReplay(record) {
  let state = structuredClone(record.initial);
  let step = 0;
  let route = null;
  return target => {
    if (target<step) {
      state = structuredClone(record.initial);
      step = 0;
      route = null;
    }
    while (step<target) {
      const entry = record.orders[step];
      let draw = 0;
      const oldTrail = state.trails?.at(-1);
      act(state,entry.side,entry.action,()=>{
        if (draw>=entry.draws.length) throw new Error('The recorded order is missing a random draw.');
        return entry.draws[draw++];
      });
      if (draw!==entry.draws.length) throw new Error('This order used a different number of random draws.');
      const newTrail = state.trails?.at(-1);
      route = newTrail!==oldTrail && newTrail?.unit===entry.action.unit &&
        entry.action.type!=='reset-unit-move' ? newTrail : null;
      step++;
    }
    return {state,entry:record.orders[step-1],route};
  };
}

export function formatFieldReport(s) {
  const lines = ['# Kriegspiel Field Report','', 'Map: '+boardDescription(s),
    'Mode: '+s.mode,'Deployment: '+s.setup,'Casualties: '+s.lossRule,'Retreats: '+s.retreatRule,
    'Terrain effects: '+(s.terrain?'on':'off'),'Options: '+JSON.stringify(s.optional ?? {}),
    'Result: '+(s.winner==='draw'?'Draw':name(s.winner)+' wins')+' — '+s.reason,''];
  const board = boardOf(s);
  for (const f of ['R','B']) {
    lines.push(name(f)+' ended with '+strength(s,f)+' CF.');
    for (const group of board.cities[f==='R'?'B':'R']) {
      const labels = group.map(id=>board.cells[id].label).join('/');
      const unit = s.units.find(u=>u.side===f&&u.type!=='LOG'&&group.includes(u.pos)&&s.captured[u.pos]===f);
      lines.push('- '+labels+' — '+(unit?'secured and occupied by '+unit.id:'no secured occupying division'));
    }
  }
  if (!s.record) return [...lines,'','This game began before notation was available. Recent field notes follow.','',...s.log.toReversed().map(line=>'- '+line)].join('\n');
  lines.push('','## Orders','','S = setup. 2.1B = a Blue decision in the first half of Turn 2, including any defending decisions. > traces a route or state change.','');
  lines.push(...orderSections(s.record.orders));
  lines.push('','## Replay data','','```json',JSON.stringify(s.record),'```','');
  return lines.join('\n');
}
