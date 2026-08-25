# GameWall Mapper

A lightweight local app to plan and map Twinkly Square tile wiring for a wall installation.

## What this does

- Visual tile map (default 7x5)
- Set master tiles (default 3 expected)
- Draw tile-to-tile wiring by clicking adjacent tiles
- Validation checks for common wiring mistakes
- Per-master chain cap enforcement (max 15 tiles per master)
- Dynamic header updates when grid size changes
- 8x8 pixel rendering inside every tile
- Static screenshot sampling at native resolutions (Mario NES 256x240, Sonic SMS 248x192, Sonic MD 320x224)
- Drag-to-pan demo mode directly on the tile map (no animation loop)
- Built-in online screenshot presets plus custom local screenshot upload
- Three additional animated character presets (Mario sprite, Sonic SMS sprite, Sonic MD sprite)
- Character animation is composited over the map pixels while preserving the static background demo
- JSON export/import of full mapping
- Auto-route helper that tries to create disjoint daisy chains from bottom-right masters

## Run locally

Open `index.html` directly in your browser, or serve the folder with any static server.

Example with Python:

```bash
cd /home/mj/Ansible/gamewall
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Run on OKD

See [OKD.md](OKD.md) for a complete build and deployment guide, including persistent storage for `characters/`.
BuildConfig manifest: [deploy/okd/buildconfig.yaml](deploy/okd/buildconfig.yaml)

## Mapping flow

1. Keep the grid at 7x5 (or resize).
2. Click `Auto-route Snake` for a starting layout.
3. Switch to `Connect` mode and adjust links tile-by-tile.
4. Review validation messages.
5. Export JSON and keep that as your install record.

## JSON format

The exported file includes:

- Grid dimensions and expected master count
- Master tile IDs and coordinates
- Connections as `{ from, to }`
- Connected components and masters per component

This mapping JSON is intended to become the source of truth for future hardware control logic.
