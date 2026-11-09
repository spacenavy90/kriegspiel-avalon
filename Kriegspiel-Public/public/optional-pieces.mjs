// Full-strength optional counters from the roster in Appendix A.
const redSpecial = [
  ['AR', 8, 6], ['AM', 4, 4], ['MTN', 4, 4], ['IN', 4, 3],
  ['IN', 4, 4], ['IN', 4, 4],
];
const airAssault = { range: 6, reducedRange: 4 };
const redArtillery = { remote: 4, range: 4, reducedCF: 2, reducedRemote: 2 };
const blueArtillery = { ...redArtillery, remote: 3 };
const redArmour = [
  ['AR', 8, 6], ['AR', 8, 6], ['AR', 8, 6], ['IN', 4, 4],
  ['IN', 4, 4], ['AA', 4, 3, airAssault], ['FA', 2, 4, redArtillery],
];
const blueArmour = [
  ['CAR', 8, 5], ['CAR', 8, 5], ['CAR', 8, 5], ['CAR', 8, 5], ['CAR', 8, 5],
  ['IN', 3, 4], ['IN', 3, 4], ['FA', 2, 4, blueArtillery],
];
const corps = (side, corps, pack, first, units) => units.map(([type, cf, mf, traits], slot) => {
  const n = first + slot;
  return { id: `${side}${n}`, side, n, corps, type, cf, mf, pack, ...traits };
});

export const extraRoster = [
  ...corps('R', 'IV', 'special', 22, [...redSpecial, ['ABI', 4, 3]]),
  ...corps('R', 'V', 'special', 29, [...redSpecial, ['ABI', 4, 3]]),
  ...corps('R', 'VI', 'special', 36, [...redSpecial, ['FA', 2, 4, { ...redArtillery, amphibious: true }]]),
  ...corps('R', 'VII', 'armour', 43, redArmour),
  ...corps('R', 'VIII', 'armour', 50, redArmour),
  ...corps('R', 'IX', 'armour', 57, redArmour),
  ...corps('B', 'D', 'armour', 20, [['CAR', 8, 5], ...blueArmour]),
  ...corps('B', 'E', 'armour', 30, blueArmour),
  ...corps('B', 'F', 'armour', 40, blueArmour),
  ...corps('B', 'G', 'special', 50, [
    ['ABI', 3, 3], ['ABI', 3, 3], ['AA', 3, 3, airAssault], ['AA', 3, 3, airAssault],
  ]),
  ...corps('B', 'H', 'special', 60, Array(4).fill(['MTN', 6, 4])),
  ...corps('B', 'I', 'special', 70, Array(4).fill(['AM', 6, 4])),
  // The printed number 73 is shared with the preceding amphibious unit.
  { id: 'B73FA', side: 'B', n: 73, corps: 'I', type: 'FA', cf: 2, mf: 4, pack: 'special',
    ...blueArtillery, reducedRemote: 1, amphibious: true },
];
