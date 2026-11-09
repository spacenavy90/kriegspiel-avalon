import { boardOf, enemy, name, paths, pieces, unitAt } from './game.mjs';
import { airliftHexes, artilleryAvailable, battleSupplyChoices, campaignEntryHexes, canBreakPrison, canFortify, canRefit, frozen,
  logisticEntryHexes, movementAllowed, nuclearBuildCosts, nuclearTargets, peaceOffers, refitSupplyChoices } from './campaign.mjs';

import { distance } from './options.mjs';

const esc = text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nums = max=>Array.from({length:Math.max(0,max+1)},(_,i)=>[i,i]);
const list = (label,key,items,extra='')=>'<label>'+label+'<select name="'+key+'" '+extra+'>'+
  items.map(([value,text])=>'<option value="'+esc(value)+'">'+esc(text)+'</option>').join('')+'</select></label>';
const checkboxes = (label,key,items)=>'<fieldset><legend>'+label+'</legend>'+items.map(([id,text])=>
  '<label class="campaign-check"><input type="checkbox" name="'+key+'" value="'+esc(id)+'"> '+esc(text)+'</label>').join('')+'</fieldset>';
const hidden = (key,value)=>'<input type="hidden" name="'+key+'" value="'+esc(value)+'">';
const order = (type,label,fields='',extra='')=>'<form class="campaign-order" data-order="'+type+'" '+extra+'>'+fields+
  '<button class="secondary" type="submit">'+label+'</button></form>';
const nameOf = (s,id)=>boardOf(s).cells[id]?.label ?? id;
const hexList = (s,ids)=>ids.map(id=>{
  const u=unitAt(s,id);
  return [id,nameOf(s,id)+(u?' · '+u.id+' '+u.cf+' CF':'')];
});
const unitList = units=>units.map(u=>[u.id,u.id+' · '+u.cf+' CF']);
const peaceChart = '<button type="button" class="text-button" data-do="rule" data-page="23">Compare peace terms · Table 10 ↗</button>';
const heading = (title,body)=>'<h2>'+title+'</h2><p>'+body+'</p>';

export function campaignPanel(s,who) {
  const c=s.campaign, b=s.battle, board=boardOf(s);
  if (s.phase==='map-choice') return heading('Map configuration challenge',name(who)+' chooses the orientation of their half.')+
    order('map-config','Place board',(who===s.firstMap?list('Board join','layout',[['standard','Long edge'],['short','Short edge']]):'')+
      list('Orientation','rotate',[['false','Upright'],['true','Rotate 180°']]));
  if (!c) return null;
  const r=c.stock[who];
  if (!r) return null;
  switch (s.phase) {
    case 'battle-support': {
      const air=Math.min(r.air,s.optional.air==='ground'?1:r.air);
      const support=artilleryAvailable(s);
      return heading('Commit battle support','Assign available remote artillery and air factors before tactics.')+
        order('battle-support','Lock support',
          (battleSupplyChoices(s).filter(([,points])=>points.length>1).map(([id,points])=>
            list(id+' logistics','supply:'+id,unitList(points))).join(''))+
          (support.length?checkboxes('Artillery','artillery',support.map(u=>[u.id,u.id+' · '+u.remote+' CF'])):'')+
          (air&&s.weather!=='snow'?list('Air factors','air',nums(air)):''));
    }
    case 'air-cap':
      return heading('Combat air patrol','Spend a factor for each attacking air factor you want to cancel.')+
        order('air-cap','Lock CAP',list('Air factors','air',nums(Math.min(r.air,b.air))));
    case 'surrender':
      return heading('Defender decision','Surrender every defender in this battle or continue to tactics.')+
        order('pass-pow','Fight')+order('surrender','Surrender all defenders');
    case 'supply-retreat':
      return heading('Unsupplied attackers','These divisions must retreat one hex before battles are assigned.')+
        c.unsupplied.map(id=>routeOrder(s,s.units.find(u=>u.id===id),'retreat',1,'supply-retreat')).join('');
    case 'hold-ground':
      return heading('Hold ground','Select any full-strength division that will lose a step in place of its final retreat hex.')+
        order('hold-ground','Confirm step choices',checkboxes('Participating divisions','units',
          unitList(s.units.filter(u=>b.hold.ids.includes(u.id)&&!u.reduced))));
    case 'crt-route': {
      const op=b.operations[0];
      return heading(op.kind==='retreat'?'Direct retreats':'Direct advances',name(op.side)+' · '+op.distance+' MF from the alternate combat table.')+
        op.ids.map(id=>routeOrder(s,s.units.find(u=>u.id===id),op.kind,op.distance-
          Number(op.kind==='retreat'&&!!b.holding?.includes(id)),'crt-route')).join('')+
        (op.kind==='advance'?order('crt-route','Finish advances',hidden('skip','true')):'');
    }
    case 'nuclear': {
      const forms=['rocket','icbm'].map(kind=>{
        const targets=nuclearTargets(s,who,kind);
        if (!targets.length) return '';
        const first=targets[0];
        const needsDecoys=s.mode!=='solo'&&!s.optional.abm;
        const near=decoyOptions(board,first).map(h=>h.id);
        return '<details class="campaign-section"><summary>'+kind.toUpperCase()+' strike · '+r[kind]+' in reserve</summary>'+
          order('nuclear-strike','Launch '+kind.toUpperCase(),hidden('kind',kind)+
            list('Target','to',hexList(s,targets.map(h=>h.id)),'data-nuke-target')+
            (needsDecoys?list('Decoy 1','decoy1',hexList(s,near),'data-nuke-target')+
              list('Decoy 2','decoy2',hexList(s,decoyOptions(board,first,board.cells[near[0]]).map(h=>h.id))):''),
            'data-strike')+'</details>';
      }).join('');
      return heading('Nuclear strike window','Launch a strike or lock the window and proceed to ground combat.')+forms+
        order('end-nuclear','Proceed to ground combat');
    }
    case 'nuclear-blast': {
      const target=board.cells[c.pending.real];
      return heading('ICBM strike succeeded','Choose two adjacent blast hexes around '+target.label+'.')+
        order('nuclear-blast','Apply ICBM blast',list('Blast hex 1','blast1',hexList(s,target.adj))+
          list('Blast hex 2','blast2',hexList(s,[...target.adj.slice(1),target.adj[0]])));
    }
    case 'intercept':
      return heading('Ballistic missile defense',c.pending.kind.toUpperCase()+' incoming. Choose an interception response.')+
        order('intercept','Intercept',s.optional.abm?list('ABM points','points',nums(r.abm)):
          list('Suspected strike hex','to',hexList(s,c.pending.candidates)));
    case 'peace-response':
      return heading('Peace talks','Choose a counteroffer before the offer is revealed.')+peaceChart+
        order('peace-response','Lock counteroffer',list('Counteroffer','response',['A','B','C','D'].map(v=>[v,v])));
    case 'treaty-pause':
      return heading('Ceasefire','The current peace terms prohibit this side from fighting.')+order('end-treaty-pause','End half-turn');
    case 'contact-review':
      return heading('Review mandatory engagements','Nuclear strikes or other compulsory actions left contacts without a complete legal grouping.')+
        order('review-contacts','Authorize deadlock ruling');
    default:return null;
  }
}

function routeOrder(s,u,kind,distance,type) {
  const ids=Object.keys(paths(s,u,kind,distance));
  return order(type,ids.length?(kind==='retreat'?'Retreat ':'Advance ')+u.id:
    (kind==='retreat'&&distance?'Remove trapped ':kind==='retreat'?'Hold ':'Skip ')+u.id,
    hidden('unit',u.id)+(ids.length?list(u.id+' destination','to',hexList(s,ids)):''));
}

export function campaignControls(s,who,selected) {
  const c=s.campaign, o=s.optional;
  if (!c || !who || !['deploy','move','plan','battle-review','nuclear'].includes(s.phase)) return '';
  const r=c.stock[who], board=boardOf(s);
  const u=s.units.find(v=>v.id===selected&&v.side===who);
  const items=[];
  if (u&&canFortify(s,u)) items.push(order('fortify',u.fort?'Remove '+u.id+' fortification':'Fortify '+u.id,hidden('unit',u.id)));
  if (s.phase==='deploy'&&o.alternatePow) {
    const ids=Object.values(board.cells).filter(h=>h.home===who&&h.terrain==='clear').map(h=>h.id);
    items.push(order('set-camp','Place POW camp',list('Camp hex','to',hexList(s,ids))));
  }
  if (s.phase==='move'&&movementAllowed(s,who)) {
    const dead=s.units.filter(u=>u.dead&&u.type!=='LOG'&&u.side===who);
    const eligible=dead.filter(u=>o.replacement==='units'?r.replacement>0:o.replacement==='factors'&&r.rf>=(u.fullCF??u.cf));
    if (eligible.length) items.push(order('rebuild','Rebuild division',list('Eliminated division','unit',unitList(eligible))));
    for (const v of s.units.filter(u=>u.side===who&&(u.rebuilt||u.released&&u.releaseTurn<=s.turn))) {
      const release=!!v.released;
      const ids=campaignEntryHexes(s,v,release?'release':'replacement');
      if (ids.length) items.push(order(release?'release-entry':'replacement-entry','Deploy '+v.id,
        hidden('unit',v.id)+list('Entry hex','to',hexList(s,ids))));
    }
    if (u) {
      const air=airliftHexes(s,u);
      if (air.length) items.push(order('airlift','Airlift '+u.id,hidden('unit',u.id)+list('Destination','to',hexList(s,air))));
      if (canRefit(s,u)) items.push(order('refit','Rest and refit '+u.id,hidden('unit',u.id)+list('Supply source','supply',refitSupplyChoices(s,u))));
    }
    if (o.supply==='logistics'||o.peace) {
      const sites=logisticEntryHexes(s,who);
      if (r.log&&sites.length) items.push(order('logistic-entry','Deploy logistic unit',list('Supply entry','to',hexList(s,sites.map(h=>h.id)))));
      items.push(order('logistic-policy',c.captureMode[who]?'Set enemy logistics to discard':'Set enemy logistics to convert',
        hidden('convert',String(!c.captureMode[who]))));
      if (r.thirdSupply&&!r.builtSupply) {
        const eligible=Object.values(board.cells).filter(h=>h.terrain==='city'&&(s.control[h.id]??h.home)===who&&!c.sites.some(m=>m.kind==='supply'&&m.pos===h.id));
        if (eligible.length) items.push(order('third-supply','Establish third supply installation',list('Friendly city','to',hexList(s,eligible.map(h=>h.id)))));
      }
    }
    if (canBreakPrison(s,who)) items.push(order('prison-break','Attempt a prison break',list('Casualty if the break fails','unit',unitList(s.units.filter(u=>u.pow===enemy(who))))));
    if (r.removeDue) items.push(order('withdraw-treaty-unit','Remove division under treaty',list('Division','unit',unitList(pieces(s,who).filter(u=>u.type!=='LOG')))));
    if (o.nuclear) for (const kind of ['rocket','icbm']) {
      const costs=nuclearBuildCosts(s,who,kind);
      if (costs.length) items.push(order('build-nuclear','Produce '+kind.toUpperCase(),hidden('kind',kind)+
        list('Pay using replacement / air factors','rf',costs.map(rf=>[rf,rf+' RF + '+((kind==='icbm'?6:3)-rf)+' ASF']))));
    }
  }
  if (s.active===who&&['move','plan','battle-review','nuclear'].includes(s.phase)) {
    if (o.nuclear) for (const kind of ['rocket','icbm']) if (r[kind]) items.push(order('discard-nuclear','Discard one '+kind.toUpperCase(),hidden('kind',kind)));
    if (o.peace&&r.peace) items.push(peaceChart+order('peace-offer','Call for peace talks',list('Secret offer','offer',Object.entries(peaceOffers))));
    for (const deal of c.deals.filter(d=>s.turn>=d.start+3)) items.push(order('break-treaty','Break '+esc(deal.label),
      hidden('deal',deal.id)+checkboxes('Defections · at least 8 CF','units',unitList(pieces(s,who).filter(u=>u.type!=='LOG')))));
  }
  const values=[];
  if (o.replacement==='factors') values.push(r.rf+' RF');
  if (o.replacement==='units') values.push(r.replacement+' replacements');
  if (o.air) values.push(r.air+' ASF');
  if (o.supply==='logistics'||o.peace) values.push(r.log+' logistics in reserve');
  if (o.abm) values.push(r.abm+' ABM');
  if (o.nuclear) values.push(r.rocket+' rockets',r.icbm+' ICBMs');
  if (o.pow) values.push(s.units.filter(u=>u.pow===who).length+' prisoners held');
  if (o.peace) values.push(r.peace+' peace tokens');
  const deals=c.deals.length?'<p>'+c.deals.map(deal=>esc(deal.label)).join(' · ')+'</p>':'';
  if (!values.length&&!items.length&&!deals) return '';
  return '<details class="campaign-section"><summary>Optional operations'+(values.length?' · '+values.join(' / '):'')+'</summary>'+
    deals+items.join('')+'</details>';
}

export function campaignMapMarkers(s,id) {
  if (!s?.campaign) return [];
  const icons={rocket:'RKT',icbm:'ICBM',pow:'POW',supply:'SUP'};
  const marks=s.campaign.sites.filter(m=>m.pos===id&&!m.captured).map(m=>icons[m.kind]);
  const fort = s.units.find(u=>u.pos===id&&u.fort)?.fort;
  if (fort) marks.push(fort==='dug'?'DUG':'FORT');
  if (frozen(s,boardOf(s).cells[id])) marks.push('ICE');
  if (s.campaign.strikes[id]) marks.push('☢');
  if (s.phase==='intercept'&&s.campaign.pending.candidates.includes(id)) marks.push('?');
  return marks;
}

function decoyOptions(board,target,first) {
  return Object.values(board.cells).filter(h=>h!==target&&h!==first&&distance(h,target)<=3&&(!first||distance(h,first)<=3));
}
export function refreshStrike(s,field) {
  const board=boardOf(s), form=field.form;
  const target=board.cells[form.elements.to.value];
  const first=form.elements.decoy1;
  if (!first) return;
  const fill = (select,items) => select.replaceChildren(...hexList(s,items.map(h=>h.id)).map(([id,label])=>new Option(label,id)));
  if (field.name==='to') fill(first,decoyOptions(board,target));
  fill(form.elements.decoy2,decoyOptions(board,target,board.cells[first.value]));
}
