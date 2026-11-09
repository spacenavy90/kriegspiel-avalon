import { boardOf } from './game.mjs';
import { maps } from './maps.mjs';
import { distance } from './options.mjs';

// §14's dashed border is printed on the classic Blue half. The recolored
// redraw keeps the same watershed but extends its outlet by one row.
// The alternate boards have no marked border. Use Blue's only lake and
// the river hex on its shore as the winter area on that map.
const winterArea = {
  blue:new Set('KK8 KK9 KK10 KK11 JJ7 JJ8 JJ9 JJ10 JJ11 II8 II9 II10 HH8 HH9 HH10 GG8'.split(' ')),
  bluecolor:new Set('KK8 KK9 KK12 JJ7 JJ8 JJ9 JJ10 JJ11 JJ12 II8 II9 II10 HH8 HH9 HH10 GG8'.split(' ')),
  bluea:new Set(['II15','HH16','GG16'])
};

const cached = new WeakMap();

function winterHexes(board) {
  const [red,blue] = board.halves;
  const cells = Object.values(board.cells);
  const area = cells.filter(h => h.home !== 'R' && winterArea[blue.asset].has(h.label.split(' / ').at(-1)));
  const frozen = new Set(area.filter(h => h.terrain === 'river' || h.terrain === 'sea').map(h => h.id));
  const redSea = new Set(cells.filter(h => h.terrain === 'sea' && (
    h.home === 'R' || h.home === null && maps[red.asset].terrain[h.label.split(' / ')[0]] === 'sea'
  )).map(h => h.id));
  let nearestSea = [], nearest = Infinity;
  for (const start of redSea) {
    const sea = [start];
    redSea.delete(start);
    let closest = Infinity;
    for (const id of sea) {
      const hex = board.cells[id];
      for (const edge of area) closest = Math.min(closest, distance(hex, edge));
      for (const adj of hex.adj) if (redSea.delete(adj)) sea.push(adj);
    }
    if (closest < nearest) {
      nearest = closest;
      nearestSea = sea;
    } else if (closest === nearest) nearestSea.push(...sea);
  }
  for (const id of nearestSea) frozen.add(id);
  return frozen;
}

// Weather state is checked by the caller so thaw can reuse the same footprint.
export function isFrozenHex(s,h) {
  if (!h || (h.terrain !== 'river' && h.terrain !== 'sea')) return false;
  const board = boardOf(s);
  if (!cached.has(board)) cached.set(board, winterHexes(board));
  return cached.get(board).has(h.id);
}
