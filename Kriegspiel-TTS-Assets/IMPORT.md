# Kriegspiel for Tabletop Simulator

This asset pack contains eight individual board halves, a joined classic board, 119 full-strength and reduced division pairs, markers, tactic decks, and player aids. Use Tabletop Simulator's **Objects → Components → Custom** menu to bring the images onto the table.

## Board

- Import `Boards/Classic-Joined-Long-Edge.png` as a **Custom Board** for the classic long-edge setup.
- For independent rotation, import a matching pair of halves at the same scale, rotate and join them, then lock them in place. The browser game's standard classic setup uses Red upright and Blue rotated 180°.
- The hex grid is printed on the board. Use it to position the counters.

## Divisions and markers

- For rigid counters, import each division as a square **Custom Tile**. Choose its `-front.png` as **Top Image** and the matching `-reduced.png` as **Bottom Image**. Use the same scale and a thin thickness for all divisions. Flip a tile to show the reduced side.
- For bulk import as flat square cards, use the paired **Division-Sheets** in a **Custom Deck**. Use **Fronts** as Face and **Reduced** as Back. Enable **Unique Backs**. Use the dimensions and count below, then deal the deck out onto the table. The last sheet cell is a neutral hidden face.
- `Division-index.csv` pairs the two faces of every counter. Blue's duplicate printed number 73 is distinguished as B73 and B73FA.
- Import markers as square tiles and duplicate them as needed. For the three suspected nuclear impact markers, use the same suspected-impact top image on all three. Pair one with the real impact bottom and the other two with the decoy bottom. The **Counter-Key** aid identifies the other symbols.

| Division sheet | Width × height | Number |
| --- | --- | ---: |
| Core Red | 6 × 4 | 21 |
| Core Blue | 5 × 4 | 18 |
| Optional Red | 7 × 7 | 42 |
| Optional Blue | 7 × 6 | 38 |

[Custom Tile help](https://kb.tabletopsimulator.com/custom-content/custom-tile/)

## Tactics

Use **Custom Deck**. Choose the sheet as **Face** and the matching back as **Back**. Leave **Unique Backs** unchecked. The last cell in each sheet already carries the shared back for hidden views. Use one copy of each appropriate deck per faction.

| Face image | Back image | Width × height | Number |
| --- | --- | --- | ---: |
| `Attack-Game-I-Sheet-2x2.png` | `Attack-Back.png` | 2 × 2 | 3 |
| `Attack-Table-11-Sheet-3x2.png` | `Attack-Back.png` | 3 × 2 | 5 |
| `Defense-Classic-Sheet-3x2.png` | `Defense-Classic-Back.png` | 3 × 2 | 4 |

In games using Table 11, use the chart to determine retreats and advances. For the supplied vintage deck, use `Defense-Sheet-3x2.png` and `Defense-Back.png` with the same dimensions and card count. The original tactic chits are also available in **Markers/Shared**.

[Custom Deck help](https://kb.tabletopsimulator.com/custom-content/custom-deck/)

## Player aids and hosting

Import charts, the reserve mat, and the order of battle as flat tiles. The main and alternate battle charts also have standalone images. Use the built-in six-sided die for weather and solitaire tables.

For a private local build, select **Local** when choosing files. For multiplayer, the host can choose **Cloud** or use image URLs reachable by all players.

[Asset importing help](https://kb.tabletopsimulator.com/custom-content/asset-importing/)

## Credits

Kriegspiel was designed by Thomas N. Shaw and originally published by Avalon Hill. The classic boards, divisions, markers, and printed aids come from Christian Holm Christensen’s re-typeset materials. The PNGs are cropped and resized, and the offensive cards and deck sheets arrange the printed chits in a browser-independent layout. These adaptations of Christensen’s materials are shared under CC BY-SA 4.0. The separately supplied alternate boards and vintage defense cards are hosted with permission.

[Christensen’s source project](https://gitlab.com/wargames_tex/kriegspiel_tex) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
