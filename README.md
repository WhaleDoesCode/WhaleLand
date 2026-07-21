# WhaleLand

A mechanics-first real-time browser RPG built for GitHub Pages and mobile play.

## Current playable loop

1. Move `[A]` around the area in real time.
2. Face numbered monsters and attack with the sword button.
3. Monsters move and attack independently on their own timers.
4. Defeated monsters drop crystals and respawn while the zone gate charges.
5. When the kill requirement is reached, the zone guardian `[B]` appears.
6. Defeat `[B]` to open the exit `[>]`.
7. Walk onto `[>]` to enter the next zone.
8. Spend crystals on permanent Damage, Health, and Defense upgrades.

Death does not remove crystals, upgrades, or zone progress.

## Controls

### Phone

Hold an on-screen direction button to keep moving. Tap **Attack** whenever the short sword cooldown finishes.

### Keyboard

- Move: hold Arrow keys or WASD
- Attack: Space or Enter

## Saving

Progress is automatically stored in the browser with the save key:

`whaleLandSaveV1`

The save belongs to the browser/device where the game is played. The real-time update uses the same save key as the original turn-based build.

## Publish with GitHub Pages

The game files are already in the root of the `main` branch.

In the repository:

1. Open **Settings**.
2. Open **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose branch **main** and folder **/(root)**.
5. Press **Save**.

The expected project-site address is:

`https://whaledoescode.github.io/WhaleLand/`

## Files

- `index.html` — game page and controls
- `style.css` — mobile layout and game appearance
- `game.js` — real-time movement, combat, enemies, zones, upgrades, and saving
- `.github/workflows/validate.yml` — checks JavaScript syntax on pushes