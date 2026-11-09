# Kriegspiel Field Table v6.1

A browser adaptation of Avalon Hill’s 1970 Kriegspiel, designed by Thomas N. Shaw.

## Start playing

On Windows, double-click **Start Kriegspiel.cmd** and open **http://127.0.0.1:4173** in your browser. Leave the host window open while you play. The host needs Node.js 20 or newer. The other player only needs a browser.

When upgrading, stop the old host before launching this version. Opening the same address in the same browser restores the saved map and selected rule options. The attacker directs defender retreats in resumed games too. Start a new table to review and change the options.

From a terminal on any supported host, run `node server.mjs --lan` from this folder. Run `node server.mjs` for access from the host computer only.

- **Solitaire** lets you command both armies using the Game III weighted tactic table. The next side to place a unit is randomized during manual deployment. You can choose or roll offensive tactics. The game rolls each defensive tactic.
- **Vs computer** lets you choose Red or Blue. The computer evaluates legal moves and combat outcomes locally. Both sides lock tactics as in hot-seat play. The computer uses a player’s view, which conceals the other side’s deployment and locked tactic.
- **Hot-seat** uses one browser. Pass the screen when the privacy cover appears. The cover stays over the visible map while zoomed or panned, and revealing the next command restores that map view.
- **LAN match** uses two browsers on the same local network. Select **Create LAN room** on the host, then share the invite link shown at the command desk. The other player opens the link and selects **Join**. If the host has several network adapters, use the address for the Wi-Fi or Ethernet network that both devices share, with the same room code. If Windows asks whether Node.js can accept connections, choose the private network for LAN play.

Solitaire and hot-seat games resume when you reopen the same browser and address. LAN seats reconnect in their original browsers while the host is running. Closing the host ends its LAN rooms.

## On the field

Choose a long- or short-edge join. Set Red and Blue to **Upright**, **Rotate 180°**, or **Random at start** independently.

Select **Review rules & start** to confirm setup. New tables start with Game I rules until you save your own under **Settings → Default game rules**. These defaults stay in this browser. Individual games can override them. Open a Game II section to choose its modules. Setup shows missing prerequisites without enabling them automatically. The mandatory-retreat table convention remains separate. Select the mode label at the command desk to inspect the confirmed rules during play, including after joining a LAN room.

Before locking deployment, select a placed division and choose a new highlighted hex. Recall all returns the unlocked army to its roster. In standard solitaire, quick deployment opens a review of both armies and recall clears both. Select a stack to choose which division to move.

Select a division, then select a highlighted destination. Hover over a hex to see its coordinate, terrain, and movement cost. Use **ZOC** to view zones of control. Roll the mouse wheel over the map to zoom around the pointer. Hold the middle mouse button and drag to pan. You can also use the zoom buttons and **Fit**, or focus the map and use arrow keys and Enter to select hexes.

**Settings** saves trail duration, faction accent colors, map contrast, and computer pace in your browser. **Trails** next to ZOC toggles the overlay. Choose the latest route or show all routes from the current half-turn or the current and previous halves. Dashed routes mark special transport and post-combat movement.

When starting **Vs computer**, choose **Recruit**, **Standard**, or **Veteran**. Veteran compares the likely outcomes of multiple legal attacks and weighs threats to its capital before moving. All three levels use the same rules and player view. **AI pace** controls the delay between orders independently of difficulty. The computer locks ordinary movement before assigning battles and choosing tactics. Later movement during combat is a retreat, withdrawal, or advance.

During combat, choose one engagement at a time. Eligible divisions remain selectable on the map and roster. **Add battle** becomes available when the grouping is legal and every remaining engaged division still has a legal assignment. **Remove** on a battle row frees only its divisions. **Suggest remaining** fills the unassigned engagements. After combat, the result screen shows how many battles remain. Use **Next battle** until the final result, then end the attacking side’s half-turn.

The **Battle chart** button opens the full combat resolution table any time. During a battle the command desk shows just the current odds group. The tactics sit above that chart, and shorter windows can expand it as needed. After the tactics are revealed, the chart highlights the result.

Use **Undo** or **Ctrl+Z** to reverse the latest eligible human action. You can undo movement, orders, and some combat decisions while you still control play. The undo stops at tactic locks or reveals, committed deployment, and turn handoffs, which protects hidden choices and prevents rerolls. A LAN undo is applied by the host and appears on both screens.

Open **Rulebook** to read the supplied 47-page rulebook in the game. Use the chapter menu or page controls to navigate. The command desk’s rule references show a short explanation on hover or focus and open the relevant page on click.

## Rules and sources

The app implements Game I and the core Game III solitaire procedure from Christian Holm Christensen’s 2023 re-typeset edition. Game setup groups Game II §§10–26 by section, including the options listed in Table 12.

| Sections | Selectable modules |
| --- | --- |
| §§10–12 | Map and deployment challenges, corps radius, additional forces, and turn-limit scoring |
| §§13–15 | Field artillery, amphibious operations, armored breakthrough, weather, and terrain |
| §§16–18 | Replacements, air support and CAP, airlift, and fortifications |
| §§19–22 | Nuclear weapons and ABM, supply, POWs, and peace talks |
| §§23–26 | Step losses, alternate CRT, hold ground and refit, drop and invasion limits, fixed initiative, stacking, strategic movement, and command |

For §12, the setup offers a draw, objective points, or the original-border territory count at a selected turn limit. The app uses named roster packs for §11.5. Where alternate maps lack matching installation labels or the printed winter border, the app uses equivalent local sites and terrain. Game IV is a separate scenario outside this adaptation.

| Reference | Behavior checked |
| --- | --- |
| Game I §§2–5 | Private deployment and reserve counts, randomized initiative, reinforcements starting on turn four, capture and occupation, victory after both sides act |
| Game I §§6–8 and Game II §15 | ZOC entry and disengagement, stacking and terrain restrictions, connected road and river movement, drops and invasions |
| Game I §§9.1–9.3 and Table 4 | Mandatory contacts, adjacent defenders, each attacker bordering every target, one assignment per division, odds and whole-unit losses, concealed tactics |
| Game I §9.4 | Full-distance retreats, terrain and ZOC restrictions, elimination if a required retreat has no legal route, retreats before advances |
| Game III §§27–28 and Table 13 | Randomized placement order in manual solitaire and weighted tactic rolls by combat odds |

**A4, A6, and D4.** These are minimum losses of 4 or 6 attacker CF or 4 defender CF, paid by the units that fought. In printed Game I you remove whole divisions. For example, with a 6-CF division and a 3-CF division facing A4, removing just the 3-CF division falls short, so the 6-CF division is the smallest legal loss. With **Step loss by factors**, you can instead flip the 6-CF division to 3 CF and combine that reduction with another loss. An 8-CF division can pay A4 by flipping to 4 CF. Flipping halves CF rounded down and takes away 1 MF. A reduced unit can be eliminated for its remaining CF. AE and DE still remove every participating unit on the named side.

**Retreat procedure.** Under Game I §9.4, the attacker decides whether all surviving defenders retreat or stay, and chooses their retreat routes. The optional table convention requires defenders to retreat and lets attackers withdraw by the card's distance. The attacker also directs defender retreats under that convention. Withdrawn attackers give up their advance.

The printed optional combat table in §23.2 assigns retreats to the opposing faction. If the table calls for the attackers to retreat, the defender chooses their route. The §23.3 hold-ground option lets a retreating unit trade the final hex for a step loss. The battle chart follows the table chosen in setup.

**Escalating Assault.** After casualties and retreats, surviving attackers can advance up to 2 MF if they have a legal route. The result screen explains when none can advance.

**Inherited combat deadlocks.** A surrounded division can begin a half-turn with mandatory enemies that cannot be partitioned into legal battles. Try repositioning first. If an inherited deadlock remains, a human can approve resolving a maximum number of contacts while keeping the adjacency and one-battle-per-unit rules. It lists the exempt divisions in the battle planner and field report.

**Victory.** The scoreboard counts enemy cities that you occupy and have held through an opposing half-turn. Adjacent city hexes count as one city. At the end of a full turn, securing every enemy city wins independently of the 20-CF threshold.

The three map sets are the classic boards from `materialsUS.pdf`, the color redraw from `Kriegspiel_Map_Boards_additional.pdf`, and Aa/Ba from `Kriegspiel_Boards_additional_01.pdf`. Terrain and transport links were digitized from the supplied artwork. The paired city hexes serve as capitals on Aa/Ba.

The rulebook and classic map and counter art come from [Christian Holm Christensen’s Kriegspiel project](https://gitlab.com/wargames_tex/kriegspiel_tex) under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The classic maps and counters were cropped, resized, and converted for browser play. The maps were also tinted and digitized for the rules engine. Rulebook previews are rendered from the supplied PDF. The local bundle also uses cropped vintage card scans.

Run `node check.mjs` for the core and Game II engine checks.
