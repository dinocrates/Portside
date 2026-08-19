# Image and audio assets

Placeholder tier (Milestone 1–2) needs nothing here — the current renderer draws colored rectangles directly in code (see `src/renderer/crane-scene.ts`). These folders are for the production art pass (Milestone 3) and hold the actual files.

Full manifest — filenames, dimensions, states/frames, anchors — lives in [`portside-motion-lab-asset-list.md`](../../portside-motion-lab-asset-list.md) at the repo root. Add files here matching that manifest; update the manifest first if a name or shape needs to change, so it stays the source of truth.

```text
sprites/       trolley, spreader, container, cargo, target bay, beacon, fx
backgrounds/   sky, port silhouette, water, ship hull, gantry, rail
audio/         empty until prioritized — spec treats audio as optional throughout
```

Vector-only elements (cables, position/velocity/acceleration/force overlay arrows, target/source zone outlines, phase/violation graph marks) are drawn in code and never belong here — see asset-list §2.11 / §3.
