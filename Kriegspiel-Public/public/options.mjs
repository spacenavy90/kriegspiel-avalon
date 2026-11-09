export const optionalSections = [
  ['10–12','Setup and victory',[
    ['mapChallenge','10','Map challenge','One side fixes its half and the join. The other then chooses its orientation.',{random:'Random first side',R:'Red first',B:'Blue first'}],
    ['deployChallenge','11.3','Deployment challenge','The second side sees the first side’s completed deployment.',{random:'Random first side',R:'Red first',B:'Blue first'}],
    ['corpsRadius','11.4','Corps deployment','Keep divisions of each corps together during deployment.',{4:'4 hexes',5:'5 hexes'}],
    ['armour','11.5','Additional armored corps','Add Red VII–IX and Blue D–F to the available roster.'],
    ['balancedArmour','11.5','Omit Blue Corps F','Use the rulebook’s smaller Blue armored roster.'],
    ['specialUnits','11.5','Amphibious and mountaineer corps','Add Red IV–VI and Blue G–I to the available roster.'],
    ['victory','12','End-of-game scoring','Apply the selected result if neither side wins normally before the turn limit.',{draw:'Turn limit · draw',objectives:'Objective points',territory:'Units across the original border'}],
    ['turnLimit','12','Final turn','The result is evaluated after both sides act.',{6:'6 turns',8:'8 turns',10:'10 turns',12:'12 turns',16:'16 turns',20:'20 turns'}]
  ]],
  ['13–15','Terrain, weather and units',[
    ['artillery','13.1','Field artillery','Added artillery can give ranged support instead of attacking at close range.'],
    ['amphibious','13.2','Amphibious operations','Added amphibious divisions can invade from coastal cities.'],
    ['breakthrough','13.3','Armored breakthrough','Armor bypasses ordinary ZOC. Armor and dug-in infantry can stop it.'],
    ['weather','14','Weather','Winter turns roll for snow or mud. Each full turn shares the same weather.'],
    ['month','14','Starting month','September is the suggested month. A two-dice roll is also available.',{random:'Roll two dice',1:'January',2:'February',3:'March',4:'April',5:'May',6:'June',7:'July',8:'August',9:'September',10:'October',11:'November',12:'December'}]
  ]],
  ['16–18','Replacements, aircraft and defenses',[
    ['replacement','16','Replacements','Bring eliminated divisions back into play.',{factors:'Replacement factors · §16.1',units:'One replacement unit · §16.2'}],
    ['air','17','Air operations','Ground support shifts odds. CAP modes add CF and allow interception.',{ground:'Ground support · §17.1',cap:'Support and CAP · capital income',limited:'Support and CAP · supply income'}],
    ['airlift','17.3','Airlift','Spend air factors to transport divisions between eligible friendly cities.'],
    ['fort','18','Fortifications','Fortified positions and dug-in infantry double defense.',{position:'Fortified positions · §18.1',dug:'Dug-in infantry · §18.2'}]
  ]],
  ['19–22','Strategic weapons, supply and negotiations',[
    ['nuclear','19','Nuclear weapons','Deploy rocket and ICBM launchers and use concealed nuclear strikes.'],
    ['pariah','19.1','Nuclear pariah','Early nuclear use gives the other side outside aid.'],
    ['abm','19.2','Alternative ABM','Use a public target and spend interception points on the ABM chart.'],
    ['supply','20','Supply','Trace supply and check isolation. Logistics also supports attacks.',{cities:'Supply cities · §20.1',logistics:'Logistic units · §20.2'}],
    ['pow','21','Prisoners of war','Defenders may surrender. Prison camps hold the captured divisions.'],
    ['prisonBreak','21.1','Prison break','Roll on the prison-break chart for unguarded camps.'],
    ['alternatePow','21.2','Alternate POW rules','Place camps during setup. Freed prisoners return at half strength.'],
    ['peace','22','Peace negotiations','Make a concealed offer and resolve the defender’s counteroffer.'],
    ['countNuclear','22.2','Count nuclear weapons in peace talks','Rockets add 1 CF and ICBMs add 3 CF to negotiating strength.']
  ]],
  ['23–26','Steps, special movement and turn order',[
    ['holdGround','23.3','Hold ground','Trade the final hex of a required retreat for a step loss.'],
    ['refit','23.4','Rest and refit','Rebuild a reduced unit with supply and replacement factors.'],
    ['clearDZ','24.1','Clear drop zones','Airborne troops can drop only on clear or road hexes.'],
    ['limitedDrop','24.2','Limited airborne movement','Permit drops into enemy ZOC. Other drops allow one follow-up hex outside enemy ZOC.'],
    ['blockedInvasion','25.1','Blocked invasions','An invasion fails when its extra enemy contacts cannot all be attacked.'],
    ['limitedInvasion','25.2','Limited invasion movement','Limit landings to one follow-up hex or the defended beach itself.'],
    ['strictInvasion','25.3','Connected waterway','A landing beach must connect by waterway to the departure city.'],
    ['initiative','26.1','Fixed initiative','Keep the same first faction for the entire game.',{random:'Random at setup',R:'Red first',B:'Blue first'}],
    ['stacking','26.2','Two-unit stacking','Up to two friendly ground units can share a hex.'],
    ['strategic','26.3','Strategic movement','Eligible divisions gain 2 MF when they stay out of combat.'],
    ['command','26.4','Command and control','Divisions beyond three hexes from their corps lose 1 MF.']
  ]]
];
const definitions = optionalSections.flatMap(([, ,fields])=>fields);
export const hasCAP = o => o?.air==='cap' || o?.air==='limited';

export function normalizeOptions(raw = {}) {
  const settings = {};
  for (const [key,,,,values] of definitions) {
    const value = raw?.[key];
    if (values ? Object.hasOwn(values,value) : value===true) settings[key]=values ? String(value) : value;
  }
  return settings;
}

export function ruleErrors(o,loss) {
  const errors = [];
  const check = (on,needed,message) => { if (on && !needed) errors.push(message); };
  const step = loss==='step' || loss==='crt';
  check(o.balancedArmour,o.armour,'Omitting Blue Corps F requires additional armored corps.');
  check(o.artillery,o.armour||o.specialUnits,'Field artillery requires at least one additional corps pack.');
  check(o.amphibious,o.specialUnits,'Amphibious operations require the amphibious and mountaineer corps.');
  check(o.victory,o.turnLimit,'End-of-game scoring needs a final turn.');
  check(o.air==='ground'||o.air==='limited',o.supply,'This air-support mode requires a supply rule.');
  check(o.airlift,hasCAP(o),'Airlift requires ground support and CAP.');
  check(o.nuclear,o.replacement==='factors'||hasCAP(o),'Nuclear weapons require replacement factors or CAP air factors.');
  check(o.pariah||o.abm,o.nuclear,'Nuclear pariah and alternative ABM require nuclear weapons.');
  check(o.prisonBreak||o.alternatePow,o.pow,'Prison break and alternate camps require prisoners of war.');
  check(o.alternatePow,step,'Alternate POW rules require a step-loss rule.');
  check(o.peace,o.nuclear&&o.supply&&o.pow&&hasCAP(o)&&o.replacement==='factors','Peace talks require nuclear weapons, supply, POWs, CAP and replacement factors.');
  check(o.countNuclear,o.peace,'Counting nuclear strength requires peace negotiations.');
  check(o.holdGround,step,'Holding ground requires a step-loss rule.');
  check(o.refit,step&&o.supply&&o.replacement==='factors','Rest and refit requires step losses, supply and replacement factors.');
  return errors;
}

export const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const distance = (a,b) => a&&b ? Math.max(Math.abs(a.c-b.c),(Math.abs(a.c-b.c)+Math.abs(a.y-b.y))/2) : Infinity;
