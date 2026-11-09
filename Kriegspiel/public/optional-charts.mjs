// Table 5. Each row lists die rolls 1–6 for the numbered month.
export const weatherByMonth = {
  1: ['clear', 'snow', 'snow', 'snow', 'snow', 'snow'],
  2: ['clear', 'clear', 'mud', 'snow', 'snow', 'snow'],
  3: ['clear', 'clear', 'clear', 'mud', 'mud', 'snow'],
  11: ['clear', 'clear', 'clear', 'clear', 'mud', 'mud'],
  12: ['clear', 'clear', 'mud', 'mud', 'snow', 'snow']
};

// Table 8. Rows are <4, 4–6, 7–9, 10–12 and >12 ABMs. True means the strike hit.
export const abmHit = [
  [false, true, true, true, true, true],
  [false, false, true, true, true, true],
  [false, false, false, true, true, true],
  [false, false, false, false, true, true],
  [false, false, false, false, false, true]
];

// Table 9. Rows are 1–2, 3–4, 5–6, 7–8 and >8 POW units. True means the break failed.
export const prisonBreakFails = [
  [false, true, true, true, true, true],
  [false, false, true, true, true, true],
  [false, false, false, true, true, true],
  [false, false, false, false, true, true],
  [false, false, false, false, false, true]
];

// Table 11. Tactics 0–2 retain the Game I indices; 3 is Engage, 4 is Assault.
// Result rows use the Game I defensive order, from Abandon position to Hold at all costs.
export const alternativeCRT = [
  {
    odds: '1:4',
    tactics: [0, 1, 2],
    results: [
      ['', '', ''],
      ['', 'AE DR1', 'AE'],
      ['AS DR1', 'AS', 'AE'],
      ['AE', 'AE', 'AE DS']
    ]
  },
  {
    odds: '1:3',
    tactics: [3, 0, 1, 2],
    results: [
      ['', '', '', ''],
      ['', 'AS DR2', 'AE', 'AE DR1'],
      ['AR1 DR1', 'AE', '', 'AE'],
      ['AE', 'AR2 DA2', 'AS DS', 'AE DS']
    ]
  },
  {
    odds: '1:2',
    tactics: [3, 0, 1, 2],
    results: [
      ['AA1 DS', '', 'AA2 DR2', 'AR2 DR1'],
      ['', 'AE DE', 'EX', 'AS DA1'],
      ['AE', 'AR2 DA1', 'AS DA1', 'DE'],
      ['AE DA2', 'EX', 'AS DR1', 'AE DS']
    ]
  },
  {
    odds: '1:1',
    tactics: [3, 0, 4, 1, 2],
    results: [
      ['AR1 DR4', 'AS DR3', 'AA2 DS', 'AS DR2', ''],
      ['', 'AS DS', 'AA1 DS', '', 'AE DS'],
      ['DE', 'AA1 DR1', '', 'AA1 DS', 'AS DE'],
      ['AE DR2', 'DS', 'AE DE', 'AS', 'AA2 DS DR2']
    ]
  },
  {
    odds: '2:1',
    tactics: [3, 0, 1, 2],
    results: [
      ['AA1 DR3', '', 'DS', 'AA2 DR3'],
      ['', 'AS DS', 'AA1 DR1', 'EX'],
      ['AS DS', 'EX', '', 'AS DE'],
      ['AR2 DS', 'AE DS', 'AS DE', 'AE DE']
    ]
  },
  {
    odds: '3:1',
    tactics: [0, 1, 2],
    results: [
      ['', '', 'AA2 DS'],
      ['', 'DE', 'EX'],
      ['DS', 'EX', 'AA1 DS'],
      ['DE', 'AS DE', 'AS DE']
    ]
  },
  {
    odds: '4:1',
    tactics: [0, 1, 2],
    results: [
      ['AA1 DR2', 'AA2 DR2', 'AA3 DE'],
      ['DE', 'DE', 'AA2 DR3'],
      ['AA2 DS', 'AS DE', 'DE'],
      ['', '', '']
    ]
  }
];
