# Portside Motion Lab — Asset List

**Companion to:** `portside-motion-lab-spec.md` (§5.4, §5.5, §11.3) and `portside-motion-lab-plan.md`
**Purpose:** Itemized, filename-level asset manifest — the "sprite manifest" deliverable called out in spec §20.7. Two tiers: **Placeholder** (Milestone 1, geometry only, no art skill needed) and **Production** (Milestone 3).

Scene basics that constrain every asset below (§5.5): logical canvas **960×540** (16:9), art grid **16 px or 32 px** modules, nearest-neighbor scaling, DOM handles all text/labels — no text baked into sprites.

Anchor conventions used below: **bottom-center** for anything standing on a surface (trolley, truck), **center** for anything whose physics origin is its own middle (container, cargo, spreader hook point).

**Status (updated as art lands):** trolley, spreader, one container color, the transfer chassis, the full crane structure, and the port/ship/water/sky background are in and wired up in `src/renderer/crane-scene.ts` — see the ✅ markers below. The delivered art consolidated some planned files (fewer, larger composited images rather than many small layered ones); where that happened, the row below is annotated with what actually shipped instead of the original per-piece plan. Renderer layout constants (`CRANE_RAIL_FRACTION`, `BACKGROUND_QUAY_FRACTION` in `crane-scene.ts`) are derived from the delivered art's own measured proportions, not the placeholder numbers below.

---

## 1. Placeholder tier (Milestone 1) — no art asset creation needed

The spec is explicit (§15, Milestone 1 exit criterion) that the full manual→automated→graded workflow should work with placeholder geometry before any art is made. This tier is colored rectangles/circles drawn in code (Phaser `Graphics` or 1×1 tinted rects), not files:

| Placeholder | Represents | Shape |
| --- | --- | --- |
| Gray rectangle, ground level | Quay / rail | Static rect |
| Blue rectangle | Trolley | Rect, tint changes on brake |
| Yellow/orange rectangle | Container | Rect |
| Green dashed outline | Target zone | Vector, not sprite |
| Red dashed outline | Source zone | Vector, not sprite |
| Thin gray line | Cable (once hoist exists) | Vector |

**Action item:** none — this tier is implemented directly in the renderer, not sourced. Skip straight to Production tier planning while Milestone 1 code uses these.

---

## 2. Production tier (Milestone 3) — sprite manifest

Grouped by spec §5.4 rows, expanded into actual files. Suggested format: PNG with alpha, power-of-two-friendly dimensions where practical, spritesheet + JSON atlas (Phaser `TexturePacker`/`atlas` format) for anything with multiple frames.

### 2.1 Port background

✅ **Delivered as one composited image instead of three layers:** `port-with-bow-ship-background-640x360-v1.png` (640×360, scaled 1.5× to fill the 960×540 canvas exactly) — sky, clouds, water, the ship's bow with stacked containers, the quay edge with bollards, and a hazy distant port skyline, all in one static painting rather than separate parallax-able layers. No parallax (planned as optional anyway). Static only — fine per §5.1, no motion required.

Originally planned as separate layers (kept here for reference, not needed given the above):

| File | Dimensions (px) | Notes |
| --- | --- | --- |
| `bg-sky.png` | 960×540 | Base layer, static |
| `bg-port-silhouette.png` | 960×200 | Distant equipment/skyline, tileable width recommended |
| `bg-water.png` | 960×120 | Animated via 2–3 frame loop or shader-free scroll; **motion must be decorative only** (§5.1) |

### 2.2 Ship

✅ **Delivered baked into the background composite** (§2.1) rather than as a separate sprite — the ship's bow and stacked containers are part of `port-with-bow-ship-background-640x360-v1.png`, fixed at the source position. No independent bob animation (acceptable — decorative motion was always optional).

### 2.3 Gantry frame

✅ **Delivered as one combined structure image**, not split rear/front: `sts-crane-structure.png` (562×300 native, scaled 1.5×) — legs, cross-bracing, boom, and the machinery house all in one sprite, rendered as a single layer (scene layer 3/8 collapsed into one, since there's no trolley/container cutout to route through — the trolley rides visually on top of the boom instead). No foreground safety-barrier layer yet.

This is still the highest-risk asset for collision-geometry mismatch (§8.7 / plan §1 Milestone 3 task) once collision detection is implemented — build hitbox rectangles against it then, not before.

Original planned per-piece dimensions (kept for reference):

| File | Dimensions | Notes |
| --- | --- | --- |
| `gantry-rear.png` | ~960×420 | Rear structure — renders behind trolley rail/container (scene layer 3) |
| `gantry-front.png` | ~960×420 | Foreground structure + safety barriers (scene layer 8) — must have transparent cutout where the container/trolley pass through |

### 2.4 Trolley rail + trolley

✅ **Trolley delivered**: `trolley.png` (52×26 native). Single state only so far — idle/moving-left/moving-right/braking is handled by direction and velocity in code (matching the simplification already recommended below), not separate art.

⬜ **Trolley rail not delivered separately** — the rail is part of the `sts-crane-structure.png` boom (§2.3), not its own asset; no gap to fill here.

⬜ **Not yet delivered:** `trolley-brake-fx.png` spark/dust cue.

Anchor as rendered: bottom-center, wheels on the boom's rail line (`CRANE_RAIL_FRACTION` in `crane-scene.ts`).

### 2.5 Spreader

✅ **Delivered**: `spreader.png` (78×19 native). Single state (locked) — open/closing/opening/fault frames not yet delivered.

Anchor as rendered: top-center, hangs below the cable; container hangs directly below it.

### 2.6 Container

✅ **One color delivered**: `container-orange.png` (78×25 native). Still needed: 3 more colors (a **distinct palette**, not literal carrier branding — see open question 4 below) and the cutaway variant for each, per the original 8-file plan:

| File | Dimensions | Notes |
| --- | --- | --- |
| `container-red.png` | ~96×64 | |
| `container-blue.png` | ~96×64 | |
| `container-green.png` | ~96×64 | |
| `container-red-cutaway.png` | ~96×64 | Interior visible, floor line marked for cargo-offset rendering |
| `container-blue-cutaway.png` | ~96×64 | |
| `container-green-cutaway.png` | ~96×64 | |

Cutaway variants need an interior floor guide (even if only used internally for aligning the cargo sprite) — flag this as a shared reference line, e.g. an agreed pixel row in the source file, so the cargo-shift renderer can place cargo consistently without per-container special-casing.

Anchor as rendered: top-center under the spreader (renderer computes the physics-center offset internally).

### 2.7 Internal cargo

| File | Dimensions | States |
| --- | --- | --- |
| `cargo-crate.png` | ~24×24 | Stable / sliding-left / sliding-right — recommend **1 sprite**, position offset + slight tilt handles sliding, no separate art needed |
| `cargo-crate-damaged.png` | ~24×24 | Impact/damaged state — distinct crack/tape overlay |

Only render inside cutaway containers. 2 files, not 4, by reusing position/rotation for the "sliding" states.

### 2.8 Truck / target bay

✅ **Delivered, renamed to match real port terminology**: `transfer-chassis.png` (100×18 native) — a chassis is the wheeled frame a container sits on for truck transport, a more accurate name than the placeholder "target bay." Single state only — empty/receiving/loaded variants not yet delivered (the target zone's dashed outline overlay currently carries the "receiving" cue instead).

Anchor as rendered: bottom-center, on the quay line.

### 2.9 Warning beacon

| File | Dimensions | Notes |
| --- | --- | --- |
| `beacon.png` spritesheet | ~16×16 × 4 frames | On/off blink loop; must be disable-able under reduced-motion unless it's carrying essential state (spec treats it as decorative — disable it) |

### 2.10 Collision / success feedback

| File | Dimensions | Frames |
| --- | --- | --- |
| `fx-impact.png` | ~64×64 | 4–6 frame burst |
| `fx-secured.png` | ~64×64 | 4–6 frame check/latch cue |
| `fx-delivered.png` | ~64×64 | 4–6 frame confirmation cue |

Keep these restrained per §5.1 ("limited decorative motion") and short enough not to obscure the graphs transition.

### 2.11 Physics overlays — **not image assets**

Position marker, velocity arrow, acceleration arrow, force arrows are explicitly vector graphics (§5.4, §8.7's "cables, arrows, paths... should be drawn as vectors"). Build these as a code module (e.g. `renderer/overlays.ts`) using Phaser `Graphics`/SVG, parameterized by color, magnitude, and label — not sourced as files. Same treatment for cables and target/source outline rectangles.

---

## 3. Non-sprite assets (flag, don't source yet)

Not in §5.4's table but implied elsewhere in the spec — resolve before Milestone 3, not during:

| Item | Where it's needed | Status |
| --- | --- | --- |
| Web font(s) for DOM UI | §5.1 "DOM-based controls... text remains sharp"; §12.1 accessibility | Decide: system font stack vs. licensed webfont. System stack is safer for LMS-embed load-time constraints (§12.2 "no required external requests after initial load") |
| Color palette / style reference sheet | §5.1 "fits the existing ENGR-120 visual identity" | **Blocking for Milestone 3** — need the existing course visual identity (brand colors, existing course graphics) before an artist or image pipeline starts |
| Favicon / LMS embed thumbnail | Deployment | Not spec'd; small ask, decide during Milestone 2 packaging |
| Audio (optional, §11.3 reserves `assets/audio/`) | Never sole indication of an event (§12.1) | Out of scope for v1; spec treats audio as optional throughout. Do not source unless explicitly prioritized |

---

## 4. File organization

Matches spec §11.3 repo layout:

Actual filenames as delivered (source of truth — the tree below is the original plan, kept for what's still outstanding):

```text
src/assets/
  sprites/
    trolley.png                          ✅ delivered (52×26)
    spreader.png                         ✅ delivered (78×19), single state
    container-orange.png                 ✅ delivered (78×25) — 1 of 4 colors
    transfer-chassis.png                 ✅ delivered (100×18), renamed from target-bay-*
    sts-crane-structure.png              ✅ delivered (562×300), combined gantry-rear+front+rail
    container-{red,blue,green}.png       ⬜ not yet delivered
    container-{color}-cutaway.png        ⬜ not yet delivered
    cargo-crate.png / -damaged.png       ⬜ not yet delivered
    trolley-brake-fx.png                 ⬜ not yet delivered
    beacon.png                           ⬜ not yet delivered
    fx-impact / -secured / -delivered.png ⬜ not yet delivered
  backgrounds/
    port-with-bow-ship-background-640x360-v1.png  ✅ delivered — combined sky+water+ship+quay+distant skyline
  audio/                                 (empty until prioritized)
```

## 5. Count summary

- **Placeholder tier:** 0 files (code-drawn geometry) — superseded now that production art has started landing
- **Delivered so far:** 6 files (5 sprites + 1 background), wired into `src/renderer/crane-scene.ts`
- **Still outstanding:** ~15–20 files depending on how the trolley/cargo simplifications land (container colors + cutaways, cargo crate, brake fx, beacon, collision/success fx)
- **Vector-only (never sourced as images):** cables, position/velocity/acceleration/force overlay arrows, target/source zone outlines, phase/violation graph marks — all still code-drawn (`src/renderer/overlays.ts`) as planned

## 6. Open questions before sourcing/commissioning art

1. ~~Is there an existing ENGR-120 visual identity doc/palette to match?~~ Resolved in practice — the delivered pieces establish a semi-realistic painted/pixel-hybrid look (not strictly 16-bit-limited-palette); treat what's landed as the de facto style reference for anything commissioned next, rather than reopening this.
2. Confirm the trolley (1 sprite + flip + brake overlay) and cargo (1 sprite + position-driven "sliding") simplifications with whoever owns art direction — the trolley simplification already matches what shipped (single sprite, no separate direction frames); cargo still pending.
3. ~~Who's producing final art?~~ Resolved — in progress, delivered incrementally.
4. **Still open:** container color choice. Literal port container colors (Maersk blue, Evergreen green, etc.) risk implying real-brand association the spec explicitly disclaims (§4.3 "no exact reproduction of... branding") — pick 3 more colors distinct from real carrier liveries before commissioning them.
