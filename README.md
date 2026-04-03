# Normuseum

Minimal first-person 3D voxel museum for Normies wallets.

## Features

- White-wall 3D gallery with first-person controls (WASD + mouse)
- Wallet connect via injected browser wallet (MetaMask and similar)
- Manual wallet lookup (0x address)
- Live wallet ownership fetch using Reservoir API (same strategy family as NormiesArchive)
- Artwork source from api.normies.art and converted into 3D voxel relief
- Dark pixels are extruded deeper to create a tactile voxel effect on each wall piece

## Run

```bash
npm install
npm run dev
```

Open the local URL shown in terminal.

## Build

```bash
npm run build
npm run preview
```

## Data sources

- https://api.normies.art
- https://api.reservoir.tools

## Notes

- The gallery renders up to 48 owned Normies at once for smooth performance.
- If wallet-connect is unavailable, paste an address manually.
