# HELLBREACH: INFERNAL PROTOCOL

A DOOM-inspired first-person shooter that runs entirely in the browser. No backend, no external services, no downloaded assets: textures and sounds are generated procedurally.

## Features
- Three.js 3D level (Mission 01: The Ashen Facility) with grid collision, doors, flickering lights and an exit portal
- Pistol (with reload), shotgun (8-pellet spread), plasma rifle (pooled projectiles)
- Three enemy types (imp, soldier, brute) with idle / chase / attack / hurt / dead states and BFS pathfinding
- Health, armor, three ammo types, pickups, HUD, pause, game over, mission complete
- Settings persisted in LocalStorage: volume, sensitivity, FOV, quality, invert Y

## Local development
```bash
npm install
npm run dev
npm run build
npm run preview
```

## Deploy to GitHub Pages
1. Push to the `main` branch of your repository.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` builds and publishes `dist/`.

`vite.config.js` uses `base: './'`, so the build works under any subpath such as `/doom-game/`.

To update: commit changes to `main`; the workflow redeploys automatically.

## Controls
WASD move · Mouse look · Left click fire · Space jump · Shift sprint · 1/2/3 weapons · R reload · E open door · Esc pause

## Known limitations
- Keyboard and mouse only; no touch controls
- No lava hazards, no key rebinding, no music track, no right-click alternate fire
- Enemies do not patrol; they idle until they see you or are shot
- Not yet verified in a real browser by the author of this build

## Credits and license
All code, textures and sounds are original and generated procedurally. Built with Three.js (MIT). Add your preferred license file before publishing.
