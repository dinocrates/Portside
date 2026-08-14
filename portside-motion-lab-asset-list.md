# Portside Motion Lab — Asset List

**Companion to:** `portside-motion-lab-spec.md` (§5.4, §5.5, §11.3) and `portside-motion-lab-plan.md`
**Purpose:** Itemized, filename-level asset manifest — the "sprite manifest" deliverable called out in spec §20.7. Two tiers: **Placeholder** (Milestone 1, geometry only, no art skill needed) and **Production** (Milestone 3).

Scene basics that constrain every asset below (§5.5): logical canvas **960×540** (16:9), art grid **16 px or 32 px** modules, nearest-neighbor scaling, DOM handles all text/labels — no text baked into sprites.

Anchor conventions used below: **bottom-center** for anything standing on a surface (trolley, truck), **center** for anything whose physics origin is its own middle (container, cargo, spreader hook point).

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

| File | Dimensions (px) | Notes |
| --- | --- | --- |
| `bg-sky.png` | 960×540 | Base layer, static |
| `bg-port-silhouette.png` | 960×200 | Distant equipment/skyline, tileable width recommended |
| `bg-water.png` | 960×120 | Animated via 2–3 frame loop or shader-free scroll; **motion must be decorative only** (§5.1) |

Parallax across these three is optional (§5.4 says "optional reduced-motion-safe parallax") — build it as a stretch item, and gate it behind `prefers-reduced-motion`.

### 2.2 Ship

| File | Dimensions | States |
| --- | --- | --- |
| `ship-hull.png` | ~480×220 | Single sprite; "idle" is the only required state |
| `ship-bob` (frame data, not new art) | — | Optional 2–4 px vertical bob animation reusing `ship-hull.png` — implement as a tween on the sprite's y-offset, not separate frames |

Anchor: bottom-center (sits on the waterline).

### 2.3 Gantry frame

| File | Dimensions | Notes |
| --- | --- | --- |
| `gantry-rear.png` | ~960×420 | Rear structure — renders behind trolley rail/container (scene layer 3) |
| `gantry-front.png` | ~960×420 | Foreground structure + safety barriers (scene layer 8) — must have transparent cutout where the container/trolley pass through |

These two are the highest-risk asset for collision-geometry mismatch (§8.7 / plan §1 Milestone 3 task) — build hitbox rectangles against these *after* final art, not before.

### 2.4 Trolley rail + trolley

| File | Dimensions | States |
| --- | --- | --- |
| `trolley-rail.png` | 960×16 (or matches gantry width) | Static track, one asset |
| `trolley.png` | ~64×48 | Base sprite — build direction via horizontal flip in code, not two mirrored files |
| `trolley-brake-fx.png` | ~24×16, 3–4 frame strip | Spark/dust cue under wheels when braking, layered on top of base trolley |

Spec lists idle/moving-left/moving-right/braking as 4 states (§5.4) — recommend collapsing to **1 base sprite + code-driven flip + 1 small braking overlay**, rather than 4 full unique sprites. Flag this simplification for art-direction sign-off; if rejected, budget 3 additional full trolley frames.

Anchor: bottom-center (rides on rail).

### 2.5 Spreader

| File | Dimensions | States |
| --- | --- | --- |
| `spreader.png` spritesheet | ~96×24 per frame | Frames: open, closing (2–3 in-between), locked, opening (reuse closing reversed), fault (distinct color/icon, e.g. flashing red corner) |

Anchor: center (hook point aligns to cable end).

### 2.6 Container

Minimum 4 colors × {normal, cutaway} = **8 files**, per §5.4:

| File | Dimensions | Notes |
| --- | --- | --- |
| `container-red.png` | ~96×64 | |
| `container-blue.png` | ~96×64 | |
| `container-green.png` | ~96×64 | |
| `container-yellow.png` | ~96×64 | Or swap for a color set matching final palette |
| `container-red-cutaway.png` | ~96×64 | Interior visible, floor line marked for cargo-offset rendering |
| `container-blue-cutaway.png` | ~96×64 | |
| `container-green-cutaway.png` | ~96×64 | |
| `container-yellow-cutaway.png` | ~96×64 | |

Cutaway variants need an interior floor guide (even if only used internally for aligning the cargo sprite) — flag this as a shared reference line, e.g. an agreed pixel row in the source file, so the cargo-shift renderer can place cargo consistently without per-container special-casing.

Anchor: center (physics origin is container center per §8.6's `cargoOffset`).

### 2.7 Internal cargo

| File | Dimensions | States |
| --- | --- | --- |
| `cargo-crate.png` | ~24×24 | Stable / sliding-left / sliding-right — recommend **1 sprite**, position offset + slight tilt handles sliding, no separate art needed |
| `cargo-crate-damaged.png` | ~24×24 | Impact/damaged state — distinct crack/tape overlay |

Only render inside cutaway containers. 2 files, not 4, by reusing position/rotation for the "sliding" states.

### 2.8 Truck / target bay

| File | Dimensions | States |
| --- | --- | --- |
| `target-bay-empty.png` | ~140×90 | |
| `target-bay-receiving.png` | ~140×90 | Or reuse empty + vector highlight ring instead of a new file |
| `target-bay-loaded.png` | ~140×90 | Container visually seated |

Anchor: bottom-center.

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

```text
src/assets/
  sprites/
    trolley.png
    trolley-brake-fx.png
    spreader.png            (+ atlas json)
    container-{color}.png
    container-{color}-cutaway.png
    cargo-crate.png
    cargo-crate-damaged.png
    target-bay-empty.png
    target-bay-receiving.png
    target-bay-loaded.png
    beacon.png               (+ atlas json)
    fx-impact.png             (+ atlas json)
    fx-secured.png            (+ atlas json)
    fx-delivered.png          (+ atlas json)
  backgrounds/
    bg-sky.png
    bg-port-silhouette.png
    bg-water.png
    ship-hull.png
    gantry-rear.png
    gantry-front.png
    trolley-rail.png
  audio/                      (empty until prioritized)
```

## 5. Count summary

- **Placeholder tier:** 0 files (code-drawn geometry)
- **Production tier:** ~27 image files (with the trolley/cargo simplifications applied) or ~32 if art direction rejects those simplifications and wants full state coverage
- **Vector-only (never sourced as images):** cables, position/velocity/acceleration/force overlay arrows, target/source zone outlines, phase/violation graph marks

## 6. Open questions before sourcing/commissioning art

1. Is there an existing ENGR-120 visual identity doc/palette to match, or are we establishing one here?
2. Confirm the trolley (1 sprite + flip + brake overlay) and cargo (1 sprite + position-driven "sliding") simplifications with whoever owns art direction — they cut ~7 files but assume the renderer can sell "sliding" via transform alone.
3. Who's producing final art — commissioned illustrator, asset pack + edits, or generated art? Affects whether "16-bit-inspired" needs a literal palette-limited pixel-art pipeline or just a stylized flat-illustration look with pixel-grid alignment.
4. Container color choice: literal port container colors (Maersk blue, Evergreen green, etc.) risk implying real-brand association the spec explicitly disclaims (§4.3 "no exact reproduction of... branding") — pick a distinct palette.
