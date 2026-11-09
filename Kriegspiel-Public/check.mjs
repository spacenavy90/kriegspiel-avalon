import assert from 'node:assert/strict';
import {
  act, actor, battleDraft, boardFor, boardOf, canUndoAction, cityProgress, contacts, createGame, deploymentHexes, lossCost, mapsAvailable, paths, pieces, playerView,
  reinforcementHexes, reserve, strength, suggestBattles, zone
} from './public/game.mjs';
import { frozen, nuclearTargets } from './public/campaign.mjs';
import { computerAction } from './public/computer.mjs';

const redFirst = () => 0.05;
const command = (game, action) => act(game, actor(game), action, redFirst);
const tile = (game, label) => Object.values(boardOf(game).cells).find(h => h.label.split(' / ').includes(label)).id;
const core = createGame({},redFirst);
assert.deepEqual([core.setup,core.terrain,core.retreatRule,core.lossRule],['free',false,'printed','whole']);

for (const map of Object.keys(mapsAvailable)) for (const layout of ['standard','parallel','short']) {
  const board = boardFor(map,layout);
  const game = createGame({map,layout},redFirst);
  command(game,{type:'auto-deploy'});
  assert.equal(pieces(game,'R').length,14);
  assert.equal(pieces(game,'B').length,13);
  assert.equal(new Set(pieces(game).map(u=>u.pos)).size,27);
  assert(Object.values(board.cells).some(h=>h.home===null));
  assert(board.cities.R.length>=3 && board.cities.B.length>=3);
  for (const h of Object.values(board.cells)) for (const n of h.adj) assert(board.cells[n].adj.includes(h.id));
}

for (const layout of ['standard','short']) for (const R of [false,true]) for (const B of [false,true]) {
  const board = boardFor('classic',layout,{R,B});
  assert.deepEqual(board.halves.map(half=>half.rotate),[R,B]);
  assert.equal(Object.values(board.cells).filter(h=>h.cap==='R').length,3);
  assert.equal(Object.values(board.cells).filter(h=>h.cap==='B').length,2);
  for (const h of Object.values(board.cells)) for (const n of h.adj) assert(board.cells[n].adj.includes(h.id));
}
const rolls = [.1,.9,.1];
const randomized = createGame({rotations:{R:'random',B:'random'}},()=>rolls.shift());
assert.deepEqual(randomized.rotations,{R:true,B:false});

const game = createGame({mode:'hot',retreatRule:'printed'},redFirst);
command(game,{type:'auto-deploy'});
assert.equal(pieces(playerView(game,'B'),'R').length,0);
assert.equal(Object.keys(playerView(game,'B').control).length,0);
assert.throws(()=>act(game,'B',{type:'deploy-ready'}),/other faction/);
command(game,{type:'deploy-ready'});
command(game,{type:'auto-deploy'});
command(game,{type:'deploy-ready'});
assert.equal(game.turn,1);
assert.equal(actor(game),'R');

// Build a contact where one attacker legally engages two adjacent defending hexes.
const [attacker,defender,second] = ['R1','B1','B2'].map(id=>game.units.find(u=>u.id===id));
for (const u of game.units) u.pos = null;
attacker.pos = tile(game,'J7');
attacker.start = attacker.pos;
defender.pos = tile(game,'BB17');
second.pos = tile(game,'BB18');
const front = tile(game,'K7');
assert(paths(game,attacker)[front]);
command(game,{type:'move',unit:attacker.id,to:front});
assert.deepEqual(game.trails.at(-1).path,[tile(game,'J7'),front]);
assert(zone(game,'B').has(front));
assert.equal(Object.keys(paths(game,attacker)).length,0);
assert.deepEqual(contacts(game),{a:['R1'],d:['B1','B2']});
assert.deepEqual(suggestBattles(game),[{a:['R1'],d:['B1','B2']}]);
command(game,{type:'end-move'});
assert.throws(()=>command(game,{type:'add-battle',a:['R1'],d:['B1']}),/required battle/);
command(game,{type:'auto-plan'});
command(game,{type:'start-battles'});
assert.equal(game.battle.odds.index,1);
command(game,{type:'choose-tactic',choice:2});
assert.equal(actor(game),'B');
assert.equal(playerView(game,'B').battle.off,null);
assert.equal(playerView(game,'B').battle.locked,true);
command(game,{type:'choose-tactic',choice:0});
assert(attacker.dead);
command(game,{type:'retreat-choice',retreat:false});
assert.equal(game.phase,'battle-review');
assert.equal(actor(game),'R');
command(game,{type:'continue-battle'});
assert.equal(actor(game),'B');
command(game,{type:'end-move'});
assert.equal(game.phase,'over');
assert.equal(game.winner,'B');
assert.equal(strength(game,'R'),0);

const retreat = createGame({mode:'computer',human:'B',retreatRule:'mandatory'},redFirst);
retreat.phase = 'plan';
retreat.active = 'R';
retreat.turn = 1;
const put = (id,c,y) => { retreat.units.find(u=>u.id===id).pos = c+','+y; };
put('R1',10,5);
put('B1',11,4);
put('R2',10,13);
put('B2',11,12);
assert.deepEqual([...battleDraft(retreat,['R1']).eligible],['R1','B1']);
assert.deepEqual([...battleDraft(retreat,[],['B2']).eligible],['R2','B2']);
assert.throws(()=>command(retreat,{type:'add-battle',a:['R1','R2'],d:['B1','B2']}),/border/);
command(retreat,{type:'auto-plan'});
command(retreat,{type:'start-battles'});
assert.deepEqual(retreat.battle.a,['R1']);
command(retreat,{type:'choose-tactic',choice:0});
command(retreat,{type:'choose-tactic',choice:1});
assert.equal(retreat.phase,'retreat');
assert.equal(actor(retreat),'R');
assert.equal(computerAction(playerView(retreat,'R'),'R').type,'retreat');
assert.equal(computerAction(playerView(retreat,'B'),'B'),null);
assert.throws(()=>act(retreat,'B',{type:'retreat',unit:'B1'}),/other faction/);
assert.throws(()=>command(retreat,{type:'retreat-choice',retreat:false}),/cannot be skipped/);
const firstDefender = retreat.units.find(u=>u.id==='B1');
const defenderRoute = Object.entries(paths(retreat,firstDefender,'retreat',2))[0];
assert.equal(defenderRoute[1].route.length,2);
command(retreat,{type:'retreat',unit:'B1',to:defenderRoute[0]});
assert.equal(retreat.phase,'withdraw');
const firstAttacker = retreat.units.find(u=>u.id==='R1');
const attackerRoute = Object.entries(paths(retreat,firstAttacker,'retreat',2))[0];
command(retreat,{type:'withdraw',unit:'R1',to:attackerRoute[0]});
assert.equal(firstAttacker.pos,attackerRoute[0]);
assert.equal(retreat.phase,'battle-review');
assert.equal(retreat.active,'R');
assert.equal(retreat.battles.length,1);
assert.throws(()=>command(retreat,{type:'end-battle'}),/current|pending/);
const review = structuredClone(retreat);
command(retreat,{type:'continue-battle'});
assert.equal(retreat.phase,'tactics');
assert.deepEqual(retreat.battle.a,['R2']);
assert.equal(retreat.battle.number,2);
assert(canUndoAction(review,retreat,{type:'continue-battle'},'R'));
const beforeLock = structuredClone(retreat);
command(retreat,{type:'choose-tactic',choice:0});
assert(!canUndoAction(beforeLock,retreat,{type:'choose-tactic'},'R'));

const printedRetreat = createGame({mode:'hot'},redFirst);
printedRetreat.phase = 'plan';
printedRetreat.active = 'R';
printedRetreat.units.find(u=>u.id==='R1').pos = '10,5';
const printedDefender = printedRetreat.units.find(u=>u.id==='B1');
printedDefender.pos = '11,4';
command(printedRetreat,{type:'auto-plan'});
command(printedRetreat,{type:'start-battles'});
command(printedRetreat,{type:'choose-tactic',choice:0});
command(printedRetreat,{type:'choose-tactic',choice:1});
assert.equal(printedRetreat.phase,'retreat-choice');
assert.equal(actor(printedRetreat),'R');
command(printedRetreat,{type:'retreat-choice',retreat:true});
assert.equal(actor(printedRetreat),'R');
const printedDestination = Object.keys(paths(printedRetreat,printedDefender,'retreat',2))[0];
command(printedRetreat,{type:'retreat',unit:'B1',to:printedDestination});
assert.equal(printedDefender.pos,printedDestination);
assert.equal(printedRetreat.phase,'battle-review');

const steps = createGame({mode:'hot',lossRule:'step'},redFirst);
steps.phase = 'plan';
steps.active = 'R';
steps.turn = 1;
const armored = steps.units.find(u=>u.id==='R1');
const special = steps.units.find(u=>u.id==='R3');
armored.pos = '10,5';
special.pos = '10,7';
steps.units.find(u=>u.id==='B14').pos = '11,6';
command(steps,{type:'auto-plan'});
command(steps,{type:'start-battles'});
command(steps,{type:'choose-tactic',choice:2});
command(steps,{type:'choose-tactic',choice:3});
assert.equal(steps.battle.outcome,'A6 DE');
assert.equal(lossCost(steps,armored,'reduce'),4);
assert.throws(()=>command(steps,{type:'take-loss',losses:[{id:'R1',kind:'reduce'}]}),/required CF/);
command(steps,{type:'take-loss',losses:[{id:'R1',kind:'reduce'},{id:'R3',kind:'reduce'}]});
assert.deepEqual([armored.cf,armored.mf,armored.pos,special.cf,special.mf],[4,5,'10,5',2,3]);
assert.equal(lossCost(steps,armored,'reduce'),0);
assert.equal(lossCost(steps,armored,'eliminate'),4);
assert.equal(steps.phase,'advance');

// Contact geometry from the supplied screenshot.
const pictured = createGame({mode:'hot'},redFirst);
pictured.phase = 'plan';
pictured.active = 'R';
for (const [id,pos] of Object.entries({R1:'10,5',R2:'10,7',R3:'11,8',B9:'11,4',B12:'11,6'})) {
  pictured.units.find(u=>u.id===id).pos = pos;
}
assert.throws(()=>command(pictured,{type:'add-battle',a:['R1','R2','R3'],d:['B9','B12']}),/border/);
command(pictured,{type:'auto-plan'});
assert.deepEqual(pictured.battles.toSorted((a,b)=>a.a[0].localeCompare(b.a[0])),[
  {a:['R1'],d:['B9']},{a:['R2','R3'],d:['B12']}
]);
const remainingBattle = structuredClone(pictured.battles[1]);
command(pictured,{type:'remove-battle',index:0});
assert.deepEqual(pictured.battles,[remainingBattle]);
assert(battleDraft(pictured).attackers.length>0);
command(pictured,{type:'auto-plan'});
assert.equal(pictured.battles.length,2);

const assault = createGame({mode:'hot'},redFirst);
assault.phase = 'plan';
assault.turn = 1;
assault.active = 'R';
assault.units.find(u=>u.id==='R1').pos = '10,5';
assault.units.find(u=>u.id==='B14').pos = '11,6';
command(assault,{type:'auto-plan'});
command(assault,{type:'start-battles'});
command(assault,{type:'choose-tactic',choice:1});
command(assault,{type:'choose-tactic',choice:2});
assert.equal(assault.battle.outcome,'DE');
assert.equal(assault.phase,'advance');
assert.throws(()=>command(assault,{type:'continue-battle'}),/Finish resolving/);
command(assault,{type:'advance',unit:'R1',to:'11,6'});
assert.equal(assault.phase,'battle-review');
assert.equal(assault.trails[0].kind,'advance');

const eliminated = createGame({mode:'hot'},redFirst);
eliminated.phase = 'plan';
eliminated.active = 'R';
eliminated.units.find(u=>u.id==='R1').pos = '10,5';
eliminated.units.find(u=>u.id==='B1').pos = '11,6';
command(eliminated,{type:'auto-plan'});
command(eliminated,{type:'start-battles'});
command(eliminated,{type:'choose-tactic',choice:1});
command(eliminated,{type:'choose-tactic',choice:1});
assert.equal(eliminated.battle.outcome,'AE DE');
assert.equal(eliminated.phase,'battle-review');
assert.match(eliminated.battle.advanceNote,/No attacking divisions survived/);

const cityGame = createGame({mode:'hot'},redFirst);
cityGame.turn = 1;
cityGame.phase = 'move';
cityGame.active = 'R';
const cities = boardOf(cityGame).cities.B;
cities.forEach(([pos],i)=>{ cityGame.units.find(u=>u.id===['R1','R2','R8','R9','R15','R16'][i]).pos = pos; });
for (let i=0;i<3;i++) cityGame.units.find(u=>u.id==='B'+(i+1)).pos = '1,'+(2+i*2);
assert(strength(cityGame,'R')>=20 && strength(cityGame,'B')>=20);
assert.deepEqual(cityProgress(cityGame,'R'),{total:cities.length,occupied:cities.length,secured:0});
command(cityGame,{type:'end-move'});
assert.equal(cityProgress(cityGame,'R').secured,0);
assert.equal(cityGame.winner,null);
command(cityGame,{type:'end-move'});
assert.equal(cityProgress(cityGame,'R').secured,cities.length);
assert.equal(cityGame.winner,'R');
assert.match(cityGame.reason,/cities captured and occupied/);

const trapped = createGame({},redFirst);
trapped.phase = 'move';
trapped.active = 'R';
trapped.units.find(u=>u.id==='R1').pos = '10,5';
trapped.units.find(u=>u.id==='B1').pos = '10,3';
trapped.units.find(u=>u.id==='B2').pos = '10,7';
assert.equal(suggestBattles(trapped),null);
assert.throws(()=>command(trapped,{type:'resolve-deadlock'}),/Adjust movement/);
trapped.inheritedDeadlock = true;
command(trapped,{type:'resolve-deadlock'});
assert.equal(trapped.combatExempt.length,1);
assert.equal(contacts(trapped).d.length,1);
assert.equal(suggestBattles(trapped).length,1);

const reinforce = createGame({},redFirst);
command(reinforce,{type:'auto-deploy'});
for (let i=0;i<6;i++) command(reinforce,{type:'end-move'});
assert.equal(reinforce.turn,4);
assert.equal(reinforce.credit.R,1);
const u = reserve(reinforce,'R')[0];
const [capital] = reinforcementHexes(reinforce,'R',u);
assert(capital);
command(reinforce,{type:'reinforce',unit:u.id,to:capital});
assert.equal(reinforce.credit.R,0);
command(reinforce,{type:'reset-move'});
assert.equal(reinforce.credit.R,1);
assert(reserve(reinforce,'R').some(piece=>piece.id===u.id));

// Run the computer through a complete turn against itself using only a player's redacted view.
const computer = createGame({mode:'computer'},redFirst);
let moves = 0, tactics = 0;
for (let i=0; i<180 && computer.turn<2 && computer.phase!=='over'; i++) {
  const side = actor(computer);
  const action = computerAction(playerView(computer,side),side);
  if (action.type==='move') {
    assert.equal(computer.phase,'move');
    moves++;
  }
  if (action.type==='choose-tactic') {
    assert.equal(computer.phase,'tactics');
    assert.notEqual(action.choice,'roll');
    tactics++;
  }
  command(computer,action);
  assert((computer.trails?.length ?? 0)<=256);
  assert((computer.lastTrails?.length ?? 0)<=256);
}
assert(computer.turn>=2 || computer.phase==='over');
assert(moves>0);
assert(tactics>0);

console.log('Game checks passed: core defaults, pictured engagements, individual removal, retreat ownership, Escalating Assault, recent trails, city victory, and computer phase order.');


assert.throws(()=>createGame({optional:{airlift:true}}),/Airlift requires/);
assert.throws(()=>createGame({optional:{peace:true}}),/Peace talks require/);
const challenge = createGame({mode:'hot',optional:{mapChallenge:'B',deployChallenge:'B',stacking:true}},redFirst);
assert.equal(actor(challenge),'B');
command(challenge,{type:'map-config',layout:'short',rotate:true});
assert.equal(actor(challenge),'R');
command(challenge,{type:'map-config',rotate:false});
assert.deepEqual(challenge.rotations,{B:true,R:false});
assert.equal(actor(challenge),'B');
const blueArmor = challenge.units.find(u=>u.id==='B1');
const blueArmor2 = challenge.units.find(u=>u.id==='B2');
const [firstHex,nextHex] = deploymentHexes(challenge,blueArmor);
command(challenge,{type:'deploy',unit:blueArmor.id,to:firstHex});
command(challenge,{type:'deploy',unit:blueArmor2.id,to:firstHex});
assert.equal(pieces(challenge,'B').filter(u=>u.pos===firstHex).length,2);
command(challenge,{type:'reposition-deploy',unit:blueArmor.id,to:nextHex});
assert.equal(blueArmor.pos,nextHex);
assert.equal(blueArmor2.pos,firstHex);
command(challenge,{type:'recall-deployment'});
assert.equal(pieces(challenge,'B').length,0);
command(challenge,{type:'auto-deploy'});
command(challenge,{type:'deploy-ready'});
assert.equal(pieces(playerView(challenge,'R'),'B').length,13);
command(challenge,{type:'auto-deploy'});
assert.equal(pieces(playerView(challenge,'B'),'R').length,0);

const reviewDeployment = createGame({},redFirst);
command(reviewDeployment,{type:'preview-deploy'});
assert.equal(reviewDeployment.phase,'deploy');
assert.equal(pieces(reviewDeployment).length,27);
command(reviewDeployment,{type:'select-deploy-side',side:'B'});
command(reviewDeployment,{type:'recall-deployment'});
assert.equal(pieces(reviewDeployment).length,0);
command(reviewDeployment,{type:'preview-deploy'});
command(reviewDeployment,{type:'deploy-ready'});
assert.equal(reviewDeployment.phase,'move');

const winter = createGame({optional:{weather:true,month:'1',initiative:'R',artillery:true,armour:true}},()=>.95);
command(winter,{type:'auto-deploy'});
assert.equal(winter.weather,'clear');
assert(winter.units.some(u=>u.type==='FA'));
const winterSnow = createGame({optional:{weather:true,month:'1',initiative:'R'}},()=>.95);
act(winterSnow,actor(winterSnow),{type:'auto-deploy'},()=>.95);
assert.equal(winterSnow.weather,'snow');
assert(frozen(winterSnow,Object.values(boardOf(winterSnow).cells).find(h=>h.label==='JJ9')));

const crt = createGame({mode:'hot',lossRule:'crt',optional:{holdGround:true}},redFirst);
crt.phase='plan';
crt.active='R';
crt.turn=1;
for (const [id,pos] of Object.entries({R1:'10,5',B1:'11,4'})) crt.units.find(u=>u.id===id).pos=pos;
command(crt,{type:'auto-plan'});
command(crt,{type:'start-battles'});
assert.equal(crt.battle.odds.index,3);
command(crt,{type:'choose-tactic',choice:3});
command(crt,{type:'choose-tactic',choice:2});
assert.equal(crt.units.find(u=>u.id==='B1').dead,true);
assert.equal(crt.phase,'battle-review');

const nuclear = createGame({mode:'hot',optional:{nuclear:true,replacement:'factors'}},redFirst);
nuclear.phase='nuclear';
nuclear.active='R';
nuclear.turn=1;
const nukeHex = nuclearTargets(nuclear,'R','rocket').find(h=>h.adj.length>=2);
command(nuclear,{type:'nuclear-strike',kind:'rocket',to:nukeHex.id,decoys:nukeHex.adj.slice(0,2)});
assert.equal(actor(nuclear),'B');
assert.equal(playerView(nuclear,'B').campaign.pending.real,undefined);
assert.equal(playerView(nuclear,'B').campaign.pending.candidates.length,3);
command(nuclear,{type:'intercept',to:nukeHex.adj[0]});
assert.equal(nuclear.phase,'nuclear');
assert.equal(nuclear.campaign.strikes[nukeHex.id],'R');

const abm = createGame({mode:'hot',optional:{nuclear:true,abm:true,replacement:'factors'}},redFirst);
abm.phase='nuclear';
abm.active='R';
abm.turn=1;
const strike = nuclearTargets(abm,'R','icbm').find(h=>h.adj.length>=2);
command(abm,{type:'nuclear-strike',kind:'icbm',to:strike.id});
assert.equal(playerView(abm,'B').campaign.pending.candidates[0],strike.id);
act(abm,'B',{type:'intercept',points:0},()=>.95);
assert.equal(abm.phase,'nuclear-blast');
assert.equal(actor(abm),'R');
assert.throws(()=>command(abm,{type:'nuclear-blast',blast:[strike.adj[0],strike.adj[0]]}),/different hexes/);
command(abm,{type:'nuclear-blast',blast:strike.adj.slice(0,2)});
assert.equal(Object.keys(abm.campaign.strikes).length,3);

for (const difficulty of ['recruit','standard','veteran']) {
  let seed=255229;
  const rng=()=> (seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32;
  const advanced=createGame({mode:'computer',difficulty,lossRule:'crt',
    optional:{stacking:true,armour:true,specialUnits:true,artillery:true,weather:true,month:'12',
      strategic:true,initiative:'R',replacement:'factors',air:'limited',airlift:true,supply:'logistics',
      nuclear:true,abm:true,pariah:true,pow:true,alternatePow:true,prisonBreak:true,
      peace:true,countNuclear:true,holdGround:true,refit:true,mapChallenge:'B',deployChallenge:'R'}},rng);
  let steps=0;
  while (advanced.turn<3 && advanced.phase!=='over' && steps++<700) {
    const side=actor(advanced);
    const order=computerAction(playerView(advanced,side),side);
    assert(order,'Computer must provide a legal order for '+advanced.phase);
    assert.doesNotThrow(()=>act(advanced,side,order,rng),difficulty+' '+advanced.phase+' '+JSON.stringify(order));
  }
  assert(steps<700,difficulty+' must make progress');
}
console.log('Advanced checks passed: setup dependencies, stacking, deployment review, weather, alternate chart, nuclear secrecy, and three AI difficulties.');
