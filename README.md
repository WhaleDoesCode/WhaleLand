# WhaleLand

A mechanics-first browser RPG built for GitHub Pages and mobile play.

## Current playable loop

1. Move `[A]` around the area.
2. Face numbered monsters and attack with the sword button.
3. Defeated monsters drop crystals and respawn while the zone gate charges.
4. When the kill requirement is reached, the zone guardian `[B]` appears.
5. Defeat `[B]` to open the exit `[>]`.
6. Walk onto `[>]` to enter the next zone.
7. Spend crystals on permanent Damage, Health, and Defense upgrades.

Death does not remove crystals, upgrades, or zone progress.

## Controls

### Phone

Use the on-screen direction pad and **Attack** button.

### Keyboard

- Move: Arrow keys or WASD
- Attack: Space or Enter

## Saving

Progress is automatically stored in the browser with the save key:

`whaleLandSaveV1`

The save belongs to the browser/device where the game is played.

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
- `game.js` — movement, combat, enemies, zones, upgrades, and saving
- `.github/workflows/validate.yml` — checks JavaScript syntax on pushes
