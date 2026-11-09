import { mapsAvailable } from './distribution.mjs';
export { mapsAvailable } from './distribution.mjs';
import { maps } from './maps.mjs';
import { distance, normalizeOptions, ruleErrors } from './options.mjs';
import { extraRoster } from './optional-pieces.mjs';
import { alternativeCRT } from './optional-charts.mjs';
import { initializeCampaign, prepareCampaign, campaignTurn, finishCampaign, advanceCampaign, campaignActor,
  campaignView, applyCampaignAction, beforeCombat, battleBriefing, frozen, damaged, attackSupplied, captureLogistics,
  movementAllowed, combatAllowed, specialAllowed, treatyDestination } from './campaign.mjs';

export const sides = ['R', 'B'];
export const enemy = side => side === 'R' ? 'B' : 'R';
export const name = side => side === 'R' ? 'Red' : 'Blue';
export const types = { AR:'Armored', CAR:'Combined arms', SOF:'Special operations', ABI:'Airborne', IN:'Infantry',
  FA:'Field artillery', AM:'Amphibious', MTN:'Mountaineer', REC:'Reconnaissance', AA:'Air assault', LOG:'Logistics' };
export const layouts = { standard: 'Long edge', short: 'Short edge' };
export const orientations = { upright:'Upright', rotated:'Rotate 180°', random:'Random at start' };
export const retreatRules = { printed:'Attacker orders retreats', mandatory:'Mandatory retreats + attacker withdrawal' };
export const lossRules = { whole:'Whole divisions · Game I', step:'Step loss by factors · §23.1', crt:'Alternate combat table · §23.2' };
export const offensive = ['Engage and hold', 'Escalating assault', 'Blitzkrieg', 'Engage', 'Assault'];
export const defensive = ['Abandon position', 'Fighting retreat', 'Standfast', 'Hold at all costs'];
export const advanceMF = [0, 2, 4];
export const retreatMF = [4, 2, 0, 0];
export const oddsLabels = ['1:3', '1:2', '1:1', '2:1', '3:1'];

// Table 4. Each row is a defensive tactic, with three attacker choices per odds column.
export const results = [
  ['', '', 'AE', '', '', 'AE', '', '', 'AE DE', '', '', 'A4 DE', '', '', 'DE'],
  ['', 'AE', 'AE', '', 'AE', '', '', 'AE DE', '', '', 'AE DE', 'DE', '', 'A4 DE', 'DE'],
  ['AE', '', 'AE', 'AE', '', 'AE D4', 'DE', '', 'AE DE', 'A4 DE', 'DE', 'A4', 'DE', 'DE', 'A4'],
  ['AE', 'AE', 'AE D4', 'AE D4', 'AE D4', 'AE', 'AE DE', 'AE DE', 'A4', 'A4 DE', 'DE', 'A4 DE', 'A4 DE', 'DE', 'A6 DE']
];
const soloDefense = [[1,0,0,0,0],[1,1,1,0,0],[2,2,1,1,0],[3,2,2,1,1],[3,3,2,2,2],[3,3,3,3,2]];
const soloOffense = [[0,0,0,0,0],[0,0,0,1,1],[0,0,1,1,1],[0,1,1,1,1],[1,1,1,2,2],[2,2,2,2,2]];
const neighbors = [[0,-2],[1,-1],[1,1],[0,2],[-1,1],[-1,-1]];
const rank = ['clear', 'river', 'beach', 'woods', 'mountain', 'sea', 'city'];
const overrides = {
  red: { B4:'river', J16:'river', H19:'sea', D3:'sea' },
  blue: { EE4:'river', DD7:'river', II8:'river', KK11:'river', DD9:'river', JJ10:'river', HH9:'clear', HH10:'clear' },
  redcolor: { B4:'river', D3:'sea' },
  bluecolor: { DD7:'river', DD9:'river', II8:'river', JJ10:'sea', HH9:'clear', HH10:'clear' },
  reda: {},
  bluea: { JJ14:'clear', JJ15:'clear', II15:'sea', HH16:'sea' }
};
const pairs = {
  classic: ['red', 'blue'],
  color: ['redcolor', 'bluecolor'],
  alternate: ['reda', 'bluea']
};
const capitals = { red:['D4','E4','E5'], blue:['EE7','DD8'], redcolor:['D4','E4','E5'], bluecolor:['EE7','DD8'], reda:['EE16','FF16'], bluea:['GG10','FF11'] };
const boards = new Map();
const cellId = (c, y) => c + ',' + y;
const edgeId = (a, b) => a < b ? a + '/' + b : b + '/' + a;

export function boardFor(map = 'classic', layout = 'standard', rotations = {}) {
  if (!Object.hasOwn(mapsAvailable,map)) map = 'classic';
  const red = rotations.R === true || rotations.R === 'rotated';
  const blue = rotations.B === undefined ? layout === 'standard' : rotations.B === true || rotations.B === 'rotated';
  const key = [map,layout,red,blue].join('/');
  if (boards.has(key)) return boards.get(key);
  const halves = pairs[map].map((asset, i) => ({
    asset, side:sides[i], x:i && layout !== 'short' ? 10 : 0, row:i && layout === 'short' ? maps[asset].rows : 0,
    rotate:i === 0 ? red : blue
  }));
  const cols = layout === 'short' ? 10 : 20;
  const rows = maps[halves[0].asset].rows * (layout === 'short' ? 2 : 1);
  const cells = {};
  const roads = new Set();
  const rivers = new Set();
  for (const half of halves) {
    const source = maps[half.asset];
    const lookup = {};
    for (const [c, col] of source.columns.entries()) {
      for (let r = 0; r <= source.rows; r++) {
        const y = 2 * r + 1 - c % 2;
        if (y > 2 * source.rows) continue;
        const label = col + (r + Math.floor(c / 2));
        const x = half.x + (half.rotate ? 10 - c : c);
        const yy = 2 * half.row + (half.rotate ? 2 * source.rows - y : y);
        if (x === 0 || x === cols || yy === 0 || yy === 2 * rows) continue;
        const id = cellId(x, yy);
        lookup[label] = id;
        const terrain = overrides[half.asset][label] ?? source.terrain[label] ?? 'clear';
        const cap = capitals[half.asset].includes(label);
        const old = cells[id];
        if (old) {
          old.label += ' / ' + label;
          old.home = null;
          if (rank.indexOf(terrain) > rank.indexOf(old.terrain)) old.terrain = terrain;
        } else {
          cells[id] = { id, c:x, y:yy, label, terrain, home:half.side, cap:cap ? half.side : null };
        }
      }
    }
    for (const [set, links] of [[roads,source.roads],[rivers,source.rivers]]) {
      for (const [a,b] of links) if (lookup[a] && lookup[b]) set.add(edgeId(lookup[a],lookup[b]));
    }
  }

  for (const h of Object.values(cells)) {
    h.adj = neighbors.map(([x,y]) => cellId(h.c+x,h.y+y)).filter(id => cells[id]);
    h.coastal = h.terrain === 'city' && h.adj.some(id => cells[id].terrain === 'sea');
  }
  const cities = { R:[], B:[] };
  const seen = new Set();
  for (const h of Object.values(cells)) {
    if (h.terrain !== 'city' || !h.home || seen.has(h.id)) continue;
    const group = [h.id];
    seen.add(h.id);
    for (const id of group) for (const adj of cells[id].adj) {
      const next = cells[adj];
      if (next.terrain !== 'city' || next.home !== h.home || seen.has(adj)) continue;
      seen.add(adj);
      group.push(adj);
    }
    cities[h.home].push(group);
  }

  const board = { cols, rows, halves, cells, roads, rivers, cities };
  boards.set(key, board);
  return board;
}

export function roster(o = {}) {
  const out = [];
  for (let n = 1; n <= 21; n++) {
    const slot = (n-1)%7;
    out.push({ id:'R'+n, side:'R', n, corps:['I','II','III'][Math.floor((n-1)/7)],
      type:['AR','AR','SOF','ABI','IN','IN','IN'][slot], cf:slot<2 ? 8 : 4, mf:[6,6,4,3,4,4,4][slot] });
  }
  for (let n = 1; n <= 18; n++) {
    out.push({ id:'B'+n, side:'B', n, corps:n<=8 ? 'A' : n<=13 ? 'B' : 'C',
      type:n<=8 ? 'CAR' : n<=13 ? 'SOF' : n<=16 ? 'IN' : 'ABI',
      cf:n<=8 ? 8 : n<=13 ? 6 : 3, mf:n<=8 ? 5 : n<=16 ? 4 : 3 });
  }
  for (const u of extraRoster) {
    if (!(u.pack==='armour' ? o.armour : o.specialUnits)) continue;
    if (u.type==='FA' && !o.artillery || u.side==='B' && u.corps==='F' && o.balancedArmour) continue;
    out.push(u);
  }
  return out.map(u => ({ ...u, pos:null, start:null, spent:0, special:false, landing:null, stopped:false, dead:false }));
}

const pickSide = rng => rng() < .5 ? 'R' : 'B';
const die = rng => Math.floor(rng()*6);
export const boardOf = s => boardFor(s.map, s.layout, s.rotations);
export const pieces = (s, side) => s.units.filter(u => u.pos && (!side || u.side === side));
export const reserve = (s, side) => s.units.filter(u => u.side === side && !u.pos && !u.dead && !u.pow && !u.rebuilt && !u.released && u.type!=='LOG');
export const unitsAt = (s,id) => s.units.filter(u=>u.pos===id);
export const unitAt = (s, id) => unitsAt(s,id).find(u=>u.type!=='LOG');
export const strength = (s, side) => pieces(s,side).reduce((sum,u) => sum+(u.remote ?? u.cf),0);
export function cityProgress(s, side) {
  const targets = boardOf(s).cities[enemy(side)];
  const occupied = targets.filter(group=>group.some(id=>unitAt(s,id)?.side===side));
  const secured = occupied.filter(group=>group.some(id=>unitAt(s,id)?.side===side && s.captured[id]===side));
  return { total:targets.length, occupied:occupied.length, secured:secured.length };
}

export function createGame(options = {}, rng = Math.random) {
  const mode = ['solo','hot','lan','computer'].includes(options.mode) ? options.mode : 'solo';
  const map = Object.hasOwn(mapsAvailable,options.map) ? options.map : 'classic';
  const layout = Object.hasOwn(layouts,options.layout) || options.layout === 'parallel' ? options.layout : 'standard';
  const setup = ['free','fixed','full'].includes(options.setup) ? options.setup : 'free';
  const rotations = Object.fromEntries(sides.map(side => {
    const selected = options.rotations?.[side];
    return [side, selected === 'random' ? rng()<.5 : selected === undefined ? side==='B' && layout==='standard' : selected === 'rotated' || selected === true];
  }));
  const retreatRule = options.retreatRule === 'mandatory' ? 'mandatory' : 'printed';
  const rules = normalizeOptions(options.optional);
  const lossRule = Object.hasOwn(lossRules,options.lossRule) ? options.lossRule : 'whole';
  const problems = ruleErrors(rules,lossRule);
  if (problems.length) throw new Error(problems.join(' '));
  const firstDeploy = sides.includes(rules.deployChallenge) ? rules.deployChallenge :
    rules.deployChallenge==='random' || mode==='solo' ? pickSide(rng) : 'R';
  const firstMap = sides.includes(rules.mapChallenge) ? rules.mapChallenge : rules.mapChallenge ? pickSide(rng) : null;
  const game = {
    mode, map, layout, setup, rotations, retreatRule, terrain:options.terrain === true,
    human:options.human === 'B' ? 'B' : 'R', lossRule, optional:rules,
    difficulty:['recruit','standard','veteran'].includes(options.difficulty) ? options.difficulty : 'standard',
    phase:firstMap?'map-choice':'deploy', deploying:firstDeploy, firstDeploy, firstMap, mapChooser:firstMap,
    turn:0, active:null, first:null, half:0, units:roster(rules),
    credit:{R:0,B:0}, held:{R:{},B:{}}, captured:{}, control:{},
    battles:[], battle:null, winner:null, reason:null, rev:0, log:[]
  };
  initializeCampaign(game,rng);
  return game;
}

export function actor(s) {
  if (s.phase==='map-choice') return s.mapChooser;
  const optionalActor = campaignActor(s);
  if (optionalActor) return optionalActor;
  if (s.phase === 'deploy') return s.deploying;
  if (s.phase === 'tactics' && (s.battle.locked || s.battle.off !== null)) return enemy(s.active);
  if (s.phase === 'loss') return s.battle.losses[0].side;
  return s.phase === 'over' ? null : s.active;
}

export function canUndoAction(before, after, action, side) {
  if (['choose-tactic','deploy-ready','nuclear-strike','nuclear-blast','intercept','peace-offer','peace-response','prison-break','surrender','pass-pow'].includes(action.type)) return false;
  if (before.turn!==after.turn || before.half!==after.half || after.phase==='over') return false;
  return before.mode==='solo' || actor(after)===side;
}

export function lossCost(s,u,kind) {
  if (!u?.pos) return 0;
  if (kind==='eliminate') return u.cf;
  return kind==='reduce' && ['step','crt'].includes(s.lossRule) && !u.reduced ? u.cf-(u.reducedCF??Math.floor(u.cf/2)) : 0;
}

export function playerView(s, side) {
  const v = { ...s };
  if (s.phase === 'deploy' && s.mode !== 'solo') {
    const visible = side===enemy(s.firstDeploy) && s.optional?.deployChallenge && s.deploying===side;
    v.units = s.units.map(u => u.side === side || visible ? u : { ...u, pos:null });
    if (!visible) v.control = Object.fromEntries(Object.entries(s.control).filter(([,owner]) => owner === side));
  }
  if (s.phase === 'tactics') v.battle = { ...s.battle, locked:s.battle.off !== null, off:null, def:null };
  delete v.movementStart;
  delete v.creditStart;
  delete v.controlStart;
  delete v.capturedStart;
  delete v.logStart;
  delete v.campaignStart;
  return campaignView(v,side);
}

export function setupPool(s, side) {
  return s.units.filter(u => u.side === side && u.type!=='LOG' && (s.setup !== 'fixed' || (side === 'R' ? u.n<=14 : u.n<=13)));
}
export const quota = (s, side) => s.setup === 'full' ? setupPool(s,side).length : side === 'R' ? 14 : 13;

export function canEnter(u,h,s) {
  return !!h && !damaged(s,h.id) && (u.type==='LOG' || frozen(s,h) || (h.terrain !== 'sea'
    && (h.terrain !== 'mountain' || (['SOF','MTN'].includes(u.type) && (!s?.weather || s.weather==='clear')))
    && (h.terrain !== 'woods' || !['AR','CAR'].includes(u.type))));
}

export function openFor(s,u,id,transit=false) {
  const others = unitsAt(s,id).filter(v=>v.id!==u.id && v.type!=='LOG');
  if (others.some(v=>v.side!==u.side)) return false;
  if (u.type==='LOG') return true;
  const size = v=>v.fort==='position'?0:v.fort==='dug'?2:1;
  const used = others.reduce((sum,v)=>sum+size(v),0);
  const capacity = s.optional?.stacking ? 2 : 1;
  return used + (transit?1:size(u)) <= capacity;
}

export function deploymentHexes(s,u) {
  const board = boardOf(s);
  const radius = Number(s.optional?.corpsRadius);
  const corps = radius ? pieces(s,u.side).filter(v=>v.id!==u.id && v.corps===u.corps) : [];
  return Object.values(board.cells).filter(h => h.home===u.side && h.id!==u.pos && canEnter(u,h,s) &&
    openFor(s,u,h.id) && corps.every(v=>distance(h,board.cells[v.pos])<=radius)).map(h=>h.id);
}

function zoc(s,board, u) {
  const h = board.cells[u.pos];
  return !h || u.type==='LOG' || (h.terrain==='sea'&&!frozen(s,h)) ? [] :
    [h.id,...h.adj.filter(id=>board.cells[id].terrain!=='sea'||frozen(s,board.cells[id]))];
}
export function zone(s, side, include = ()=>true) {
  const board = boardOf(s);
  return new Set(pieces(s,side).filter(include).flatMap(u => zoc(s,board,u)));
}

function movementCost(s, board, u, from, to) {
  if (u.type==='LOG') return 3;
  const edge = edgeId(from,to);
  if (s.weather==='snow' && board.roads.has(edge)) return 1.5;
  if (!s.terrain) return 3;
  if (board.roads.has(edge)) return 1;
  const h = board.cells[to];
  if (frozen(s,h)) return 3;
  if (h.terrain === 'river' && !board.rivers.has(edge)) return 9;
  if (h.terrain === 'mountain' || h.terrain === 'woods') return 6;
  return 3;
}
export function moveAllowance(s,u) {
  if (u.type==='LOG') return u.mf;
  const weather = s.weather==='mud'||s.weather==='snow'?2:0;
  return Math.max(0,u.mf-weather-(u.commandPenalty??0));
}
const armor = u=>u.type==='AR'||u.type==='CAR';
const movementZoc = (s,u)=>s.optional?.breakthrough && armor(u) ?
  zone(s,enemy(u.side),v=>armor(v)||v.fort==='dug') : zone(s,enemy(u.side));

export function routeFor(s,u,kind,id,distance) {
  return paths(s,u,kind,distance)[id];
}

export function paths(s, u, kind = 'move', distance = u.mf) {
  const board = boardOf(s);
  const start = board.cells[u.pos];
  if (!start || !Number.isFinite(distance) || distance<0 || u.fort || (kind==='move' && (u.stopped || !movementAllowed(s,u.side) ||
      s.weather==='snow'&&start.terrain==='mountain'))) return {};
  const danger = zone(s,enemy(u.side));
  const stopZone = kind==='move' ? movementZoc(s,u) :
    kind==='advance'?zone(s,enemy(u.side),v=>v.fort!=='dug' && !(v.fort==='position' && !unitsAt(s,v.pos).some(w=>w.id!==v.id&&w.type!=='LOG'))):danger;
  const base = kind==='move'?moveAllowance(s,u)*3-u.spent:distance*3;
  const bonus = kind==='move'&&s.optional?.strategic&&u.type!=='LOG'&&!u.contacted&&!danger.has(u.start)&&!u.special ? 6:0;
  const limit = kind==='move'&&u.followup ? Math.min(base,3-u.spent) : base+bonus;
  const found = {};
  if (kind === 'retreat') {
    function visit(pos, route) {
      if (route.length === distance + 1) {
        if (pos!==u.pos && openFor(s,u,pos)) found[pos] ??= { cost:distance*3, route:route.slice(1) };
        return;
      }
      for (const next of board.cells[pos].adj) {
        if (!openFor(s,u,next,true) || danger.has(next) || route.includes(next) || !canEnter(u,board.cells[next],s)) continue;
        visit(next, [...route,next]);
      }
    }
    visit(u.pos,[u.pos]);
    return found;
  }
  const open = [{ id:u.pos, cost:0, route:[] }];
  const best = new Map([[u.pos,0]]);
  while (open.length) {
    open.sort((a,b) => a.cost-b.cost);
    const { id, cost, route } = open.shift();
    if (best.get(id) !== cost) continue;
    if (id !== u.pos) {
      if (openFor(s,u,id) && (kind!=='move'||treatyDestination(s,u,id)) && (u.type!=='LOG'||board.cells[id].terrain!=='sea')) found[id] = { cost, route };
      if (kind==='move'&&s.campaign?.captureMode[u.side]&&unitsAt(s,id).some(v=>v.side!==u.side&&v.type==='LOG')) continue;
      if (stopZone.has(id) || kind==='move'&&u.followup) continue;
    }
    for (const next of board.cells[id].adj) {
      if (kind === 'advance' && u.landing && (id === u.pos ? next !== u.landing : s.optional?.limitedInvasion)) continue;
      if (kind==='advance' && unitsAt(s,next).some(v=>v.side!==u.side&&v.fort==='position')) continue;
      if (kind === 'move' && ((stopZone.has(id) && stopZone.has(next)) || (u.followup&&danger.has(next)) ||
          (u.strategicUsed&&danger.has(next)))) continue;
      if (!openFor(s,u,next,true) || !canEnter(u,board.cells[next],s)) continue;
      const total = cost + (kind === 'move' && !u.followup ? movementCost(s,board,u,id,next) : 3);
      if (total>base && (danger.has(next)||route.some(p=>danger.has(p)))) continue;
      if (kind==='move' && !combatAllowed(s,u.side) && danger.has(next)) continue;
      if (total > limit || total >= (best.get(next) ?? Infinity)) continue;
      best.set(next,total);
      open.push({ id:next, cost:total, route:[...route,next] });
    }
  }
  return found;
}

export function specialHexes(s,u) {
  if (!u.pos || u.pos !== u.start || u.spent || u.special || u.stopped || u.fort ||
      !movementAllowed(s,u.side)||!specialAllowed(s,u.side)) return {};
  const board = boardOf(s), h = board.cells[u.pos], out = {};
  if (u.type === 'ABI' && h.terrain === 'city' && (s.control[h.id] ?? h.home) === u.side) {
    const z = zone(s,enemy(u.side));
    for (const to of Object.values(board.cells)) {
      if (s.optional?.clearDZ && to.terrain!=='clear' && !to.adj.some(id=>board.roads.has(edgeId(to.id,id)))) continue;
      if (canEnter(u,to,s) && (s.optional?.limitedDrop || !z.has(to.id)) && openFor(s,u,to.id) &&
          (combatAllowed(s,u.side)||!z.has(to.id))) out[to.id] = null;
    }
  }
  if ((u.type==='SOF'||s.optional?.amphibious&&(u.type==='AM'||u.amphibious)) && h.coastal && s.weather!=='snow' && combatAllowed(s,u.side)) {
    const water = new Set([h.id]);
    if (s.optional?.strictInvasion) for (const id of water) {
      for (const next of board.cells[id].adj) if (board.rivers.has(edgeId(id,next))) water.add(next);
    }
    for (const to of Object.values(board.cells)) {
      if (to.terrain!=='beach'||damaged(s,to.id)||unitAt(s,to.id)?.side===u.side&&!openFor(s,u,to.id)) continue;
      if (s.optional?.limitedInvasion&&!unitAt(s,to.id)&&zone(s,enemy(u.side)).has(to.id)) continue;
      const sea = to.adj.find(id => board.cells[id].terrain==='sea' && !unitAt(s,id) &&
        (!s.optional?.strictInvasion || water.has(id)));
      if (sea) out[to.id] = sea;
    }
  }
  return out;
}

export function reinforcementHexes(s, side, u) {
  if (!s.credit[side]) return [];
  const cap = Object.values(boardOf(s).cells).filter(h => h.cap === side);
  if (cap.some(h => unitAt(s,h.id)?.side === enemy(side))) return [];
  return cap.filter(h=>openFor(s,u,h.id)&&canEnter(u,h,s)).map(h=>h.id);
}

function targetGraph(s) {
  const board = boardOf(s);
  const excluded = new Set(s.combatExempt);
  const defenders = pieces(s,enemy(s.active)).filter(u=>!excluded.has(u.id)&&u.type!=='LOG' &&
    (u.fort!=='position'||!unitsAt(s,u.pos).some(v=>v.id!==u.id&&v.type!=='LOG')));
  const graph = new Map();
  for (const u of pieces(s,s.active)) {
    if (excluded.has(u.id) || u.fort==='position'||u.strategicUsed) continue;
    const zoneIds = u.landing ? (s.optional?.blockedInvasion ?
      [u.landing,...board.cells[u.landing].adj] : [u.landing]) : zoc(s,board,u);
    const targets = defenders.filter(d => zoneIds.includes(d.pos)).map(d => d.id);
    if (targets.length) graph.set(u.id,targets);
  }
  return graph;
}

export function contacts(s) {
  const graph = targetGraph(s);
  return { a:[...graph.keys()], d:[...new Set([...graph.values()].flat())] };
}

function validGroup(s, graph, a, d) {
  const board = boardOf(s);
  if (!Array.isArray(a) || !Array.isArray(d) || !a.length || !d.length || new Set(a).size !== a.length || new Set(d).size !== d.length) return false;
  if (a.some(id => !d.every(target => graph.get(id)?.includes(target)))) return false;
  const pos = d.map(id => s.units.find(u => u.id === id).pos);
  const exposed = new Set([...graph.values()].flat());
  if (pieces(s,enemy(s.active)).some(u=>exposed.has(u.id)&&pos.includes(u.pos)&&!d.includes(u.id))) return false;
  return pos.every((id,i) => pos.slice(i+1).every(p => id===p||board.cells[id].adj.includes(p)));
}

export function battleDraft(s, a = [], d = []) {
  const graph = targetGraph(s);
  const board = boardOf(s);
  const used = new Set(s.battles.flatMap(g => [...g.a,...g.d]));
  const attackers = [...graph.keys()].filter(id => !used.has(id));
  const defenders = [...new Set([...graph.values()].flat())].filter(id => !used.has(id));
  const positions = Object.fromEntries(pieces(s).map(u => [u.id,u.pos]));
  const adjacent = (id,target) => positions[id]===positions[target] || board.cells[positions[id]].adj.includes(positions[target]);
  const canDraft = (attack,defense) => {
    if (!defense.every((id,i) => defense.slice(i+1).every(target => adjacent(id,target)))) return false;
    if (!attack.length) return attackers.some(id => defense.every(target => graph.get(id).includes(target)));
    if (!defense.length) return defenders.some(target => attack.every(id => graph.get(id).includes(target)));
    return attack.every(id => defense.every(target => graph.get(id).includes(target)));
  };
  const complete = validGroup(s,graph,a,d);
  return {
    attackers, defenders,
    eligible: new Set([
      ...attackers.filter(id => a.includes(id) || canDraft([...a,id],d)),
      ...defenders.filter(id => d.includes(id) || canDraft(a,[...d,id]))
    ]),
    complete,
    legal: complete && suggestBattles(s,[...s.battles,{a,d}]) !== null
  };
}

export function suggestBattles(s, planned = [], partial = false) {
  const graph = targetGraph(s);
  const usedA = new Set(planned.flatMap(group => group.a));
  const usedD = new Set(planned.flatMap(group => group.d));
  const a = [...graph.keys()].filter(id => !usedA.has(id));
  const d = [...new Set([...graph.values()].flat())].filter(id => !usedD.has(id));
  if (!a.length || !d.length) return partial || (!a.length && !d.length) ? [] : null;
  const board = boardOf(s);
  const pos = Object.fromEntries(pieces(s).map(u => [u.id,u.pos]));
  const hexes = [...new Set(d.map(id=>pos[id]))];
  const candidates = [];
  function addGroups(group, start) {
    if (group.length) {
      const available = a.filter(id => group.every(target => graph.get(id).includes(target)));
      if (!available.length) return;
      for (let mask = 1; mask < 2**available.length; mask++) {
        const attack = available.filter((_,i) => mask & (1<<i));
        candidates.push({ a:attack, d:group, all:[...attack,...group] });
      }
    }
    for (let i = start; i < hexes.length; i++) {
      if (group.every(id=>board.cells[pos[id]].adj.includes(hexes[i]))) addGroups([...group,...d.filter(id=>pos[id]===hexes[i])],i+1);
    }
  }
  addGroups([],0);
  const rows = new Map([...a,...d].map(id => [id, candidates.filter(g => g.all.includes(id))
    .sort((x,y) => y.all.length-x.all.length)]));
  const memo = new Map();
  const coverage = groups => groups.reduce((sum,g)=>sum+g.a.length+g.d.length,0);
  const attackCount = groups => groups.reduce((sum,g)=>sum+g.a.length,0);
  function cover(left) {
    if (!left.size) return [];
    const key = [...left].join('/');
    if (memo.has(key)) return memo.get(key);
    let choices = null;
    let pivot;
    for (const id of left) {
      const options = rows.get(id).filter(g => g.all.every(unit => left.has(unit)));
      if (!options.length && !partial) return null;
      if (!choices || options.length < choices.length) { choices = options; pivot = id; }
    }
    let best = null;
    function consider(groups) {
      if (!best || coverage(groups)>coverage(best) ||
          (coverage(groups)===coverage(best) && attackCount(groups)>attackCount(best))) best = groups;
    }
    for (const g of choices) {
      const next = cover(new Set([...left].filter(id => !g.all.includes(id))));
      if (!next) continue;
      const groups = [{ a:g.a, d:g.d },...next];
      if (!partial || coverage(groups)===left.size) return groups;
      consider(groups);
    }
    if (partial) consider(cover(new Set([...left].filter(id=>id!==pivot))));
    memo.set(key,best);
    return best;
  }
  return cover(new Set([...a,...d]));
}

export function battleOdds(s, a, d, support = [], air = 0, shift = 0) {
  const board = boardOf(s);
  const get = id => s.units.find(u => u.id === id);
  const attack = a.reduce((sum,id) => sum+(get(id)?.cf ?? 0),air) + support.reduce((sum,id)=>sum+(get(id)?.remote ?? 0),0);
  const defend = d.reduce((sum,id) => {
    const u = get(id);
    const hex = board.cells[u?.pos];
    const fort = u?.fort==='dug' || unitsAt(s,u?.pos).some(v=>v.side===u?.side&&v.fort==='position');
    return sum+(u?.cf ?? 0)*(fort || (s.terrain && !frozen(s,hex) && ['city','river','mountain','woods'].includes(hex?.terrain)) ? 2 : 1);
  },0);
  const ratio = attack/defend;
  const index = ratio>=3 ? 4 : ratio>=2 ? 3 : ratio>=1 ? 2 : ratio>=.5 ? 1 : 0;
  const alternate = ratio>=4?6:ratio>=3?5:ratio>=2?4:ratio>=1?3:ratio>=.5?2:ratio>=1/3?1:0;
  return s.lossRule==='crt' ? { attack,defend,index:Math.min(6,alternate+shift),alternate:true } :
    { attack, defend, index:Math.min(4,index+shift) };
}
export const combatOddsLabel = b => b.odds.alternate ? alternativeCRT[b.odds.index].odds : oddsLabels[b.odds.index];
export const attackTactics = b => b.odds.alternate ? alternativeCRT[b.odds.index].tactics : [0,1,2];
export function combatResult(b,a,d) {
  const chart = b.odds.alternate && alternativeCRT[b.odds.index];
  return chart ? chart.results[d][chart.tactics.indexOf(a)] : results[d][b.odds.index*3+a];
}

function assert(ok, message) {
  if (!ok) throw new Error(message);
}
export function note(s,text) {
  s.log.unshift(text);
  s.log.length = Math.min(s.log.length,80);
}
export function place(s,u,id) {
  u.pos = id;
  if (u.type==='LOG') return;
  if (s.control[id] && s.control[id] !== u.side) delete s.captured[id];
  s.control[id] = u.side;
}
export function eliminate(s,u) {
  u.pos = null;
  u.dead = true;
  u.landing = null;
  delete u.fort;
}
export function reduce(s,u) {
  if (u.reduced) { eliminate(s,u); return; }
  u.reduced = true;
  u.fullCF = u.cf;
  u.fullMF = u.mf;
  if (u.remote) { u.fullRemote=u.remote; u.remote=u.reducedRemote??Math.floor(u.remote/2); }
  if (u.reducedRange) { u.fullRange=u.range; u.range=u.reducedRange; }
  u.cf = u.reducedCF??Math.floor(u.cf/2);
  u.mf = u.reducedMF??u.mf-1;
}
export function relocate(s,u,route,kind) {
  const path = [u.pos,...route];
  const escort = kind==='retreat'&&s.optional?.supply&&
    !unitsAt(s,u.pos).some(v=>v.id!==u.id&&v.type!=='LOG') ?
    unitsAt(s,u.pos).filter(v=>v.type==='LOG'&&v.side===u.side) : [];
  for (const logistic of escort) logistic.pos = path.at(-1);
  for (const id of route) {
    place(s,u,id);
    if (u.type!=='LOG') captureLogistics(s,u,id);
  }
  rememberRoute(s,u,path,kind);
}
function rememberRoute(s,u,path,kind) {
  s.trails ??= [];
  s.trails.push({ unit:u.id, side:u.side, path, kind });
  if (s.trails.length>256) s.trails.shift();
}
function beginSide(s,side) {
  s.active = side;
  s.phase = 'move';
  s.battle = null;
  s.battles = [];
  s.lastTrails = s.trails ?? [];
  s.trails = [];
  s.combatExempt = [];
  prepareCampaign(s,side);
  unfortifyAdjacent(s);
  s.inheritedDeadlock = suggestBattles(s)===null;
  const board = boardOf(s);
  for (const u of pieces(s,side)) {
    u.start = u.pos;
    u.spent = 0;
    u.special = false;
    u.stopped = false;
    u.followup = false;
    u.strategicUsed = false;
    u.contacted = false;
    u.invaded = false;
    u.fortChanged = false;
    u.fired = false;
    u.commandPenalty = Number(!!s.optional?.command&&u.type!=='LOG'&&!pieces(s,side).some(v=>v.id!==u.id&&
      v.corps===u.corps&&distance(board.cells[u.pos],board.cells[v.pos])<=3));
  }
  if (s.turn>=4) s.credit[side] = Math.min(s.credit[side]+1,reserve(s,side).length);
  s.movementStart = structuredClone(s.units);
  s.controlStart = { ...s.control };
  s.capturedStart = { ...s.captured };
  s.creditStart = s.credit[side];
  s.logStart = [...s.log];
  if (s.campaign) s.campaignStart = structuredClone(s.campaign);
}
function beginTurn(s,rng) {
  s.turn++;
  s.half = 0;
  campaignTurn(s,rng);
  if (!s.optional?.initiative || !s.first) s.first = sides.includes(s.optional?.initiative) ? s.optional.initiative : pickSide(rng);
  note(s,'Turn '+s.turn+' · '+name(s.first)+' has initiative.');
  beginSide(s,s.first);
}
export function endSide(s,rng) {
  const side = s.active;
  const board = boardOf(s);
  for (const u of pieces(s,side)) if (board.cells[u.pos].terrain === 'sea'&&!frozen(s,board.cells[u.pos])) eliminate(s,u);
  for (const u of pieces(s,enemy(side))) {
    if (u.type!=='LOG' && s.held[u.side][u.id] === u.pos) s.captured[u.pos] = u.side;
  }
  s.held[side] = Object.fromEntries(pieces(s,side).filter(u=>u.type!=='LOG').map(u => [u.id,u.pos]));
  finishCampaign(s,side);
  if (s.half === 0) {
    s.half = 1;
    note(s,name(enemy(side))+' takes the second half of turn '+s.turn+'.');
    beginSide(s,enemy(side));
    return;
  }
  const red = strength(s,'R'), blue = strength(s,'B');
  const occupiers = sides.filter(f=>{
    const cities = cityProgress(s,f);
    return cities.total>0 && cities.secured===cities.total;
  });
  if (red<20 || blue<20) {
    s.winner = red===blue ? 'draw' : red>blue ? 'R' : 'B';
    s.reason = 'Field strength at turn end · Red '+red+' CF / Blue '+blue+' CF.';
    if (occupiers.includes(s.winner)) s.reason += ' All enemy cities were also captured and occupied.';
  } else if (occupiers.length) {
    s.winner = occupiers.length===2 ? 'draw' : occupiers[0];
    s.reason = 'All enemy cities captured and occupied.';
  }
  if (!s.winner) advanceCampaign(s);
  if (s.winner) {
    s.phase = 'over';
    s.battle = null;
    note(s,s.winner==='draw' ? 'The battle ends in a draw.' : name(s.winner)+' wins the battle.');
    return;
  }
  beginTurn(s,rng);
}

function finishDeployment(s,rng,automatic) {
  const side = s.deploying;
  if (s.mode === 'solo' && !s.optional?.deployChallenge) {
    const remaining = sides.filter(f => pieces(s,f).length < quota(s,f));
    if (!remaining.length) {
      s.soloDeployReview = true;
    } else {
      s.deploying = remaining.length === 1 ? remaining[0] : pickSide(rng);
    }
  } else if (pieces(s,side).length === quota(s,side) && automatic === 'commit') {
    if (side === (s.firstDeploy ?? 'R')) s.deploying = enemy(side);
    else beginTurn(s,rng);
  }
}

function autoDeploy(s,side,rng) {
  const pool = setupPool(s,side).filter(u => !u.pos);
  const board = boardOf(s);
  const targets = Object.values(board.cells).filter(h => h.home === side);
  const frontline = s.layout==='short' ? h => side==='R' ? h.y : -h.y : h => side==='R' ? h.c : -h.c;
  const scores = Object.fromEntries(targets.map(h => [h.id, frontline(h)*.52 + rng()*5]));
  for (const u of pool) {
    if (pieces(s,side).length >= quota(s,side)) break;
    const legal = deploymentHexes(s,u).sort((a,b) => {
      const value = id => scores[id] + (board.cells[id].cap && u.type==='ABI' ? 5 : 0);
      return value(b)-value(a);
    });
    if (legal.length) place(s,u,legal[0]);
  }
}
function unfortifyAdjacent(s) {
  if (!s.optional?.fort || !s.active) return;
  const board = boardOf(s);
  for (const u of pieces(s,enemy(s.active))) {
    if (u.fort==='position' && !unitsAt(s,u.pos).some(v=>v.id!==u.id&&v.type!=='LOG') &&
        board.cells[u.pos].adj.some(id=>unitsAt(s,id).some(v=>v.side===s.active&&v.type!=='LOG'))) delete u.fort;
  }
}

export function startBattle(s,rng = Math.random) {
  const g = s.battles.shift();
  const number = (s.battle?.number ?? (s.battle ? 1 : 0))+1;
  s.battle = { ...g, number, odds:battleOdds(s,g.a,g.d), off:null, def:null, outcome:null, losses:[], retreat:[], advance:[] };
  s.phase = 'tactics';
  battleBriefing(s,rng);
}

export function finishBattle(s) {
  for (const u of pieces(s,s.active)) {
    if (u.landing && s.battle.a.includes(u.id)) {
      note(s,u.id+' failed to secure the beach and was lost.');
      eliminate(s,u);
    }
  }
  s.phase = 'battle-review';
}
function enterAdvance(s) {
  const b = s.battle;
  const surviving = b.a.filter(id=>s.units.find(u=>u.id===id).pos);
  b.advance = surviving.filter(id=>!b.withdrawn?.includes(id));
  if (advanceMF[b.off] && advanceUnits(s).length) {
    s.phase = 'advance';
    return;
  }
  if (advanceMF[b.off]) b.advanceNote = !surviving.length?'No attacking divisions survived to advance.':
    !b.advance.length?'All surviving attackers withdrew.':'The surviving attackers have no legal advance route.';
  finishBattle(s);
}
export function advanceUnits(s) {
  const b = s.battle;
  return b.advance.map(id=>s.units.find(u=>u.id===id)).filter(u=>u.pos && Object.keys(paths(s,u,'advance',advanceMF[b.off])).length);
}
function afterRetreats(s) {
  const b = s.battle;
  if (s.retreatRule === 'mandatory' && retreatMF[b.def]) {
    b.withdrawn = [];
    b.withdraw = b.a.filter(id => s.units.find(u => u.id===id).pos);
    if (withdrawalUnits(s).length) {
      s.phase = 'withdraw';
      return;
    }
  }
  enterAdvance(s);
}

export function withdrawalUnits(s) {
  const b = s.battle;
  return (b.withdraw ?? []).map(id => s.units.find(u => u.id===id))
    .filter(u => u.pos && !u.landing && Object.keys(paths(s,u,'retreat',retreatMF[b.def])).length);
}

function afterLosses(s) {
  const b = s.battle;
  if (b.losses.length) { s.phase = 'loss'; return; }
  if (b.odds.alternate) { nextCombatOperation(s); return; }
  b.retreat = b.d.filter(id=>s.units.some(u=>u.id===id&&u.pos&&u.fort!=='dug'));
  if (retreatMF[b.def] && b.retreat.length) {
    if (s.retreatRule==='mandatory') beginRetreat(s,b.retreat,enemy(s.active),'retreat');
    else s.phase = 'retreat-choice';
  }
  else afterRetreats(s);
}
function beginRetreat(s,ids,side,next) {
  if (s.optional?.holdGround && ids.some(id=>s.units.some(u=>u.id===id&&!u.reduced))) {
    s.battle.hold = { ids,side,next };
    s.phase = 'hold-ground';
  } else s.phase = next;
}

function nextCombatOperation(s) {
  const b = s.battle;
  while (b.operations.length) {
    const next = b.operations[0];
    next.ids = next.ids.filter(id=>s.units.some(u=>u.id===id&&u.pos&&!u.fort));
    if (!next.ids.length) { b.operations.shift(); continue; }
    if (next.kind==='retreat') beginRetreat(s,next.ids,next.side,'crt-route');
    else s.phase = 'crt-route';
    return;
  }
  finishBattle(s);
}

function resolveAlternate(s) {
  const b = s.battle;
  const sidesInBattle = { A:s.active,D:enemy(s.active) };
  const groups = { A:b.a,D:b.d };
  const live = key=>s.units.filter(u=>u.pos&&groups[key].includes(u.id));
  b.operations = [];
  const results = b.outcome.split(' ').filter(Boolean);
  if (results.includes('EX')) {
    const attack = live('A').reduce((total,u)=>total+u.cf,0);
    const defend = live('D').reduce((total,u)=>total+u.cf,0);
    const smaller = attack<=defend?'A':'D';
    const larger = smaller==='A'?'D':'A';
    live(smaller).forEach(u=>eliminate(s,u));
    if (attack===defend) live(larger).forEach(u=>eliminate(s,u));
    else b.losses.push({ ids:groups[larger],minimum:Math.min(attack,defend),side:sidesInBattle[larger] });
  }
  for (const code of results) {
    if (code==='EX') continue;
    const [faction,effect,count] = code;
    const side = sidesInBattle[faction];
    const ids = groups[faction];
    if (effect==='E') live(faction).forEach(u=>eliminate(s,u));
    if (effect==='S'&&live(faction).length) b.losses.push({ ids,minimum:0,side,stepOnly:true });
    if (effect==='A'||effect==='R') b.operations.push({ side,ids:[...ids],kind:effect==='A'?'advance':'retreat',distance:Number(count) });
  }
  b.operations.sort((a,b)=>Number(a.kind==='advance')-Number(b.kind==='advance'));
  afterLosses(s);
}
function resolveTactics(s) {
  const b = s.battle;
  b.outcome = combatResult(b,b.off,b.def);
  note(s,combatOddsLabel(b)+' · '+offensive[b.off]+' / '+defensive[b.def]+' · '+(b.outcome || 'No casualties')+(b.roll?' · defense d6 '+b.roll:''));
  if (b.odds.alternate) { resolveAlternate(s); return; }
  for (const result of b.outcome.split(' ').filter(Boolean)) {
    const attack = result[0] === 'A';
    const ids = attack ? b.a : b.d;
    const units = s.units.filter(u => ids.includes(u.id) && u.pos);
    const minimum = Number(result[1]);
    if (result[1]==='E' || units.reduce((sum,u) => sum+u.cf,0)<=minimum) units.forEach(u => eliminate(s,u));
    else b.losses.push({ ids, minimum, side:attack ? s.active : enemy(s.active) });
  }
  afterLosses(s);
}

export function act(s, who, action, rng = Math.random) {
  assert(who === actor(s) && who, 'It is the other faction’s decision.');
  assert(action && typeof action.type === 'string', 'Choose an action.');
  const unit = s.units.find(u => u.id === action.unit);
  const board = boardOf(s);
  const to = typeof action.to === 'string' && Object.hasOwn(board.cells,action.to) ? board.cells[action.to] : null;
  const b = s.battle;
  if (applyCampaignAction(s,who,action,rng)) { s.rev++; return s; }
  switch (action.type) {
    case 'map-config': {
      assert(s.phase==='map-choice' && typeof action.rotate==='boolean','Choose a map orientation.');
      if (who===s.firstMap) {
        assert(action.layout==='standard'||action.layout==='short','Choose the map join.');
        s.layout = action.layout;
      }
      s.rotations[who] = action.rotate;
      if (who===s.firstMap) s.mapChooser = enemy(who);
      else {
        s.phase = 'deploy';
        initializeCampaign(s,rng);
      }
      break;
    }
    case 'deploy': {
      assert(s.phase==='deploy' && unit?.side===who && !unit.dead && setupPool(s,who).includes(unit), 'Choose a division from the deployment roster.');
      assert(!unit.pos && pieces(s,who).length<quota(s,who) && deploymentHexes(s,unit).includes(to?.id), 'Choose a vacant legal hex in your nation.');
      place(s,unit,to.id);
      finishDeployment(s,rng);
      break;
    }
    case 'reposition-deploy':
      assert(s.phase==='deploy'&&unit?.side===who&&unit.pos&&deploymentHexes(s,unit).includes(to?.id),'Choose a legal deployment hex for that division.');
      if (unitsAt(s,unit.pos).length===1) delete s.control[unit.pos];
      delete unit.fort;
      place(s,unit,to.id);
      break;
    case 'select-deploy-side':
      assert(s.phase==='deploy'&&s.mode==='solo'&&!s.optional?.deployChallenge&&s.soloDeployReview&&sides.includes(action.side),
        'Complete the initial placement before switching deployment sides.');
      s.deploying = action.side;
      break;
    case 'recall-deployment': {
      const all = s.mode==='solo'&&!s.optional?.deployChallenge;
      const placed = pieces(s,all?null:who);
      assert(s.phase==='deploy'&&placed.length,'There are no divisions to recall.');
      for (const u of placed) { delete s.control[u.pos]; u.pos = null; delete u.fort; }
      delete s.soloDeployReview;
      break;
    }
    case 'undeploy':
      assert(s.phase==='deploy' && (s.mode!=='solo'||s.optional?.deployChallenge) && unit?.side===who && unit.pos, 'This division cannot be returned to the roster.');
      if (unitsAt(s,unit.pos).length===1) delete s.control[unit.pos];
      unit.pos = null;
      delete unit.fort;
      break;
    case 'preview-deploy':
    case 'auto-deploy':
      assert(s.phase==='deploy', 'Deployment is complete.');
      if (s.mode==='solo' && !s.optional?.deployChallenge) {
        sides.forEach(side => autoDeploy(s,side,rng));
        if (action.type==='preview-deploy') s.soloDeployReview=sides.every(side=>pieces(s,side).length===quota(s,side));
        else beginTurn(s,rng);
      } else autoDeploy(s,who,rng);
      break;
    case 'deploy-ready':
      assert(s.phase==='deploy' && pieces(s,who).length===quota(s,who), 'Deploy all starting divisions first.');
      if (s.mode==='solo'&&!s.optional?.deployChallenge) {
        assert(s.soloDeployReview&&sides.every(side=>pieces(s,side).length===quota(s,side)),'Deploy both factions before locking.');
        delete s.soloDeployReview;
        beginTurn(s,rng);
      } else finishDeployment(s,rng,'commit');
      break;
    case 'move': {
      assert(s.phase==='move' && unit?.side===who && unit.pos, 'Select one of your divisions in movement.');
      const path = to && paths(s,unit)[to.id];
      assert(path, 'That hex is outside this division’s legal movement.');
      relocate(s,unit,path.route,'move');
      unit.spent += path.cost;
      const danger = zone(s,enemy(who));
      unit.contacted ||= path.route.some(id=>danger.has(id));
      unit.strategicUsed ||= unit.spent>moveAllowance(s,unit)*3;
      unit.stopped ||= movementZoc(s,unit).has(to.id) || unit.followup;
      if (unit.type==='LOG'&&danger.has(to.id)) eliminate(s,unit);
      unfortifyAdjacent(s);
      break;
    }
    case 'special': {
      assert(s.phase==='move' && unit?.side===who && unit.pos, 'Select a division to transport.');
      const targets = specialHexes(s,unit);
      assert(to && Object.hasOwn(targets,to.id), 'That hex is outside this division’s legal landing area.');
      const origin = unit.pos;
      unit.special = true;
      unit.invaded = unit.type!=='ABI';
      if (unitAt(s,to.id)?.side===enemy(who)) {
        unit.pos = targets[to.id];
        unit.landing = to.id;
        unit.stopped = true;
      } else {
        place(s,unit,to.id);
        captureLogistics(s,unit,to.id);
        unit.stopped = zone(s,enemy(who)).has(to.id);
        unit.followup = !!(unit.type==='ABI'?s.optional?.limitedDrop:s.optional?.limitedInvasion);
      }
      rememberRoute(s,unit,[origin,unit.pos],unit.type==='ABI'?'drop':'invasion');
      note(s,unit.id+' '+(unit.type==='ABI'?'dropped into':'launched an invasion at')+' '+to.label+'.');
      break;
    }
    case 'reinforce':
      assert(s.phase==='move' && reserve(s,who).includes(unit) && reinforcementHexes(s,who,unit).includes(to?.id), 'No reinforcement can enter that capital hex.');
      place(s,unit,to.id);
      unit.start = null;
      unit.spent = 0;
      unit.stopped = zone(s,enemy(who)).has(to.id);
      s.credit[who]--;
      note(s,name(who)+' reinforced '+to.label+' with '+unit.id+'.');
      break;
    case 'reset-move':
      assert(s.phase==='move', 'Movement is already locked.');
      s.units = structuredClone(s.movementStart);
      s.control = { ...s.controlStart };
      s.captured = { ...s.capturedStart };
      s.credit[who] = s.creditStart;
      s.log = [...s.logStart];
      s.trails = [];
      if (s.campaignStart) s.campaign = structuredClone(s.campaignStart);
      break;
    case 'resolve-deadlock':
    case 'end-move': {
      assert(s.phase==='move', 'Movement is already locked.');
      beforeCombat(s,rng,action.type==='resolve-deadlock');
      break;
    }
    case 'add-battle': {
      assert(s.phase==='plan', 'Combat assignments are closed.');
      const graph = targetGraph(s);
      assert(validGroup(s,graph,action.a,action.d), 'Every attacker must border every target, and all targets must border each other.');
      const used = new Set(s.battles.flatMap(g => [...g.a,...g.d]));
      assert([...action.a,...action.d].every(id => !used.has(id)), 'Each division can be assigned to only one battle.');
      const plan = [...s.battles,{ a:[...action.a], d:[...action.d] }];
      assert(suggestBattles(s,plan), 'That assignment leaves a required battle without a legal group.');
      s.battles = plan;
      break;
    }
    case 'clear-plan':
      assert(s.phase==='plan', 'Combat assignments are closed.');
      s.battles = [];
      break;
    case 'remove-battle':
      assert(s.phase==='plan' && Number.isInteger(action.index) && action.index>=0 && action.index<s.battles.length, 'Choose a battle in the plan.');
      s.battles.splice(action.index,1);
      break;
    case 'auto-plan': {
      assert(s.phase==='plan', 'Combat assignments are closed.');
      const plan = suggestBattles(s,s.battles);
      assert(plan, 'No legal assignments remain. Clear the battle plan to try again.');
      s.battles.push(...plan);
      break;
    }
    case 'start-battles': {
      assert(s.phase==='plan', 'Combat assignments are closed.');
      const needed = contacts(s);
      assert(s.battles.length && s.battles.flatMap(g=>g.a).length===needed.a.length
        && s.battles.flatMap(g=>g.d).length===needed.d.length, 'Assign every engaged division before resolving combat.');
      note(s,name(who)+' began combat · '+s.battles.length+' '+(s.battles.length===1?'battle':'battles')+'.');
      startBattle(s,rng);
      break;
    }
    case 'choose-tactic': {
      assert(s.phase==='tactics', 'Tactics are already revealed.');
      const attack = b.off===null;
      const random = attack && s.mode==='solo' && action.choice==='roll';
      const choices = attack ? attackTactics(b) : [0,1,2,3];
      assert(random || choices.includes(action.choice), 'Select an available tactic.');
      if (attack) {
        const column = b.odds.alternate?Math.max(0,Math.min(4,b.odds.index-1)):b.odds.index;
        b.off = random ? soloOffense[die(rng)][column] : action.choice;
        if (s.mode==='solo') {
          b.roll = die(rng)+1;
          b.def = soloDefense[b.roll-1][column];
          resolveTactics(s);
        }
      } else {
        b.def = action.choice;
        resolveTactics(s);
      }
      break;
    }
    case 'take-loss': {
      assert(s.phase==='loss', 'No division losses are pending.');
      const loss = b.losses[0];
      const choices = action.losses ?? (Array.isArray(action.units) ? action.units.map(id=>({id,kind:'eliminate'})) : []);
      assert(Array.isArray(choices) && choices.length && choices.every(choice=>choice && loss.ids.includes(choice.id))
        && new Set(choices.map(choice=>choice.id)).size===choices.length, 'Select participating divisions to take the losses.');
      const entries = choices.map(({id,kind})=>{
        const division = s.units.find(u=>u.id===id);
        return { division, kind, cost:lossCost(s,division,kind) };
      });
      const total = entries.reduce((sum,entry)=>sum+entry.cost,0);
      assert(entries.every(entry=>entry.cost>0 || loss.stepOnly && entry.division?.pos && entry.kind==='reduce' && !entry.division.reduced) && total>=loss.minimum, 'The selected losses do not meet the required CF loss.');
      assert(!loss.stepOnly || entries.length===1 && (entries[0].division.reduced ? entries[0].kind==='eliminate' : entries[0].kind==='reduce'),'Take exactly one step loss.');
      for (const {division,kind,cost} of entries) {
        if (kind==='eliminate') eliminate(s,division);
        else reduce(s,division);
        note(s,division.id+(kind==='reduce'?' reduced':' eliminated')+' · −'+cost+' CF.');
      }
      b.losses.shift();
      afterLosses(s);
      break;
    }
    case 'retreat-choice':
      assert(s.phase==='retreat-choice' && s.retreatRule!=='mandatory', 'Retreats required by the defense card cannot be skipped.');
      if (action.retreat===true) beginRetreat(s,b.retreat,enemy(s.active),'retreat');
      else enterAdvance(s);
      break;
    case 'retreat': {
      assert(s.phase==='retreat' && unit?.side===enemy(who) && unit.pos && b.retreat.includes(unit.id), 'Select a defending division in this battle to retreat.');
      const distance = retreatMF[b.def]-Number(!!b.holding?.includes(unit.id));
      const options = paths(s,unit,'retreat',distance);
      if (Object.keys(options).length) {
        assert(to && options[to.id], 'The retreat must reach a legal hex at full distance.');
        relocate(s,unit,options[to.id].route,'retreat');
        note(s,unit.id+' retreated to '+to.label+'.');
      } else if (distance) {
        eliminate(s,unit);
        note(s,unit.id+' was eliminated with no legal retreat.');
      }
      if (unit.pos&&b.holding?.includes(unit.id)) reduce(s,unit);
      b.retreat = b.retreat.filter(id=>id!==unit.id);
      if (!b.retreat.length) afterRetreats(s);
      break;
    }
    case 'hold-ground':
      assert(s.phase==='hold-ground' && Array.isArray(action.units) &&
        action.units.every(id=>b.hold.ids.includes(id)&&s.units.some(u=>u.id===id&&u.pos&&!u.reduced)), 'Choose full-strength divisions to hold ground.');
      b.holding = [...new Set(action.units)];
      s.phase = b.hold.next;
      break;
    case 'crt-route': {
      assert(s.phase==='crt-route','No alternate combat movement is pending.');
      const order = b.operations[0];
      if (action.skip) {
        assert(order.kind==='advance','Required retreats cannot be skipped.');
        b.operations.shift();
        nextCombatOperation(s);
        break;
      }
      assert(unit?.pos&&order.ids.includes(unit.id),'Choose a participating division.');
      const distance = order.distance-Number(order.kind==='retreat'&&!!b.holding?.includes(unit.id));
      const routes = paths(s,unit,order.kind,distance);
      if (to && routes[to.id]) {
        relocate(s,unit,routes[to.id].route,order.kind);
        if (order.kind==='advance') unit.landing = null;
      } else {
        assert(!Object.keys(routes).length,'Choose a legal route.');
        if (order.kind==='retreat' && (distance||unit.landing)) eliminate(s,unit);
      }
      if (unit.pos&&order.kind==='retreat'&&b.holding?.includes(unit.id)) reduce(s,unit);
      order.ids = order.ids.filter(id=>id!==unit.id);
      if (!order.ids.length) { b.operations.shift(); nextCombatOperation(s); }
      break;
    }
    case 'withdraw': {
      assert(s.phase==='withdraw' && b.withdraw.includes(unit?.id) && !unit.landing, 'Choose a surviving attacking division that can withdraw.');
      const path = to && paths(s,unit,'retreat',retreatMF[b.def])[to.id];
      assert(path, 'Withdrawal must follow a legal retreat route at full distance.');
      relocate(s,unit,path.route,'withdraw');
      b.withdraw = b.withdraw.filter(id=>id!==unit.id);
      b.withdrawn.push(unit.id);
      note(s,unit.id+' withdrew to '+to.label+'.');
      if (!withdrawalUnits(s).length) enterAdvance(s);
      break;
    }
    case 'end-withdraw': {
      assert(s.phase==='withdraw', 'Attacker withdrawal is unavailable.');
      enterAdvance(s);
      break;
    }
    case 'advance': {
      assert(s.phase==='advance' && unit?.pos && b.advance.includes(unit.id), 'Select an attacking division to advance.');
      const path = to && paths(s,unit,'advance',advanceMF[b.off])[to.id];
      assert(path, 'The advance must follow a legal route.');
      relocate(s,unit,path.route,'advance');
      unit.landing = null;
      b.advance = b.advance.filter(id=>id!==unit.id);
      if (!advanceUnits(s).length) {
        if (b.advance.length) b.advanceNote = 'The remaining attackers have no legal advance route.';
        finishBattle(s);
      }
      break;
    }
    case 'end-battle':
      assert(s.phase==='advance', 'Resolve the pending combat decisions first.');
      b.advanceNote = 'The attacker ended the advance phase.';
      finishBattle(s);
      break;
    case 'continue-battle':
      assert(s.phase==='battle-review', 'Finish resolving the current battle first.');
      if (s.battles.length) startBattle(s,rng);
      else endSide(s,rng);
      break;
    default: throw new Error('Unknown action.');
  }
  s.rev++;
  return s;
}


