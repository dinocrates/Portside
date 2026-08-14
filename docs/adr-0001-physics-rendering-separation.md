# ADR-0001: Separate the deterministic physics engine from Phaser/rendering

**Status:** Accepted
**Context:** Portside Motion Lab, spec §11.1–§11.5

## Decision

`src/sim/**` is a framework-independent TypeScript module. It must not import Phaser, browser DOM APIs, chart/plotting code, or storage code. It exposes a `SimulationEngine` with `reset`, `step`, and `getSnapshot`, operating purely on plain-data types (`ScenarioConfig`, `ControlCommand`, `SimulationSnapshot`).

Everything downstream — the Phaser scene renderer, the analysis/graphing layer, CSV/JSON export, local-storage autosave — consumes `SimulationSnapshot` values and never writes back into physics state.

## Why

- **Determinism and testability (spec §3, principle 5).** A pure engine can run headlessly in Vitest at arbitrary speed, with golden fixtures pinning exact input/output pairs. Coupling it to Phaser's scene lifecycle or `requestAnimationFrame` would make that testing story much weaker and slower.
- **Physics drives animation, not the reverse (spec §3, principle 1).** If the renderer or a tween system could nudge position/velocity directly, "the graphs are evidence" (principle 3) stops being true — a displayed graph could show something that never happened in the authoritative model.
- **One engine, two control modes (spec §3, principle 2).** Manual and automated control both need to produce the exact same `ControlCommand` shape and hit the exact same `engine.step()`. If manual input were wired directly into Phaser's input→sprite pipeline, it would be structurally tempting to special-case it, breaking that guarantee.
- **Reuse across future lab modules (spec §2.4, §15 Milestone 5).** Dynamics, statics, energy, and controls modules are supposed to reveal more of the *same* model, not fork it. A framework-independent core is what makes "same run and cargo, new overlay" actually cheap.
- **Headless CI.** Phaser requires a canvas/WebGL context; a pure TS engine does not. Unit tests for physics correctness should never need a browser.

## Consequences

- The renderer needs one explicit, documented coordinate transform (`src/renderer/coordinate-transform.ts`) converting SI physics coordinates to canvas pixels. This is the *only* place physics-to-pixel conversion happens.
- Any temptation to "just quickly read trolley position off the Phaser sprite" for a UI readout is wrong — UI reads from the last `SimulationSnapshot`, same as the renderer.
- Golden fixtures (`tests/fixtures/**`) are the contract between physics, UI, and rendering/testing agents (spec §14.2) — they exercise `src/sim` alone, no browser.
- This does cost some duplication: the renderer maintains its own interpolation/visual state for smoothness between physics steps (spec §8.2), separate from the authoritative snapshot history. That's an accepted tradeoff, not a violation — interpolation is visual-only and never fed back into physics.

## Alternatives considered

- **Physics inside a Phaser scene, using Phaser's Arcade/Matter physics.** Rejected: couples the authoritative model to a rendering framework's update loop and physics assumptions, undermines headless testing, and makes reuse across non-Phaser contexts (e.g. a future static analysis tool, or swapping the renderer) much harder.
- **Physics and rendering in the same module, disciplined by convention only.** Rejected: "physics drives animation" needs to be structurally true, not just a code-review norm, given multiple workstreams (and agents) touching this code in parallel (spec §16).
