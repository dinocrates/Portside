# Portside Motion Lab — Implementation Plan

**Companion to:** `portside-motion-lab-spec.md`
**Purpose:** Turn the product spec into sequenced, assignable work. This is the plan we execute against; the spec stays the source of truth for *what* and *why*.

---

## 0. Before any code: pre-Milestone-0 deliverables

Spec §20 lists these as "recommended next deliverables." They're not optional polish — Milestone 0 can't start safely without most of them, because they're what let physics, UI, rendering, and analysis work in parallel without inventing conflicting state. Do these first, in this order:

| # | Deliverable | Blocks | Notes |
| --- | --- | --- | --- |
| 1 | `AGENTS.md` — repo rules, directory ownership (spec §11.3, §16) | Parallel work starting | Codify the "must not own" column from §16 as enforceable rule, not just intent |
| 2 | ADR: physics/rendering separation | Engine + renderer work | One page: why the sim engine never imports Phaser/DOM (§11.1), how snapshots cross the boundary |
| 3 | Core TypeScript contracts (`ControlCommand`, `SimulationEngine`, `Controller`, `SimulationSnapshot`, `ScenarioConfig`) | Everything | Lift directly from spec §10.1 and §11.4; this is the interface freeze |
| 4 | JSON Schema + first scenario (`fragile-freight.json`) | Engine, UI, tests | Validate §10.1 shape at load time; fail loud with dev-readable errors |
| 5 | Golden physics test vectors (horizontal motion only) | Physics work, regression safety | Spec §14.2 format; start with constant-acceleration and triangular/trapezoidal profile cases |
| 6 | Issue backlog by milestone/dependency | Task assignment | This document + a tracker (GitHub Issues/Projects) |
| 7 | Sprite manifest (filenames, dimensions, anchors, frames) | Rendering/asset work | See `portside-motion-lab-asset-list.md` — already drafted, ready to become this deliverable |
| 8 | Student-facing lab handout | Pilot testing, not engineering | Can trail the others; needed before Milestone 2 pilot |

**Exit criterion for this phase:** a second engineer (or agent) could start on the UI or renderer using only items 1–5, without asking what a `SimulationSnapshot` looks like.

---

## 1. Milestone sequence

Reproduced from spec §15 with tasks broken out. Each milestone lists its concrete tasks, the workstream that owns them (§16), and dependencies. Sequence is mostly linear across milestones but §16's four workstreams run in parallel *within* Milestones 1–5 once contracts are frozen.

### Milestone 0 — Contracts and skeleton

- [ ] Lock coordinate conventions and units (§8.1) — SI internally, one documented pixel transform
- [ ] Finalize state/command/snapshot/controller/run-record types (§11.4)
- [ ] Scenario schema + validator (§10.1)
- [ ] Golden test vectors for simple horizontal motion (§14.2)
- [ ] Static deployment pipeline (Vite build → static host, no backend)
- [ ] Unit test harness (Vitest) wired to CI
- [ ] Browser smoke test harness (Playwright) wired to CI
- [ ] Placeholder-rectangle renderer driven purely by engine snapshots

**Exit:** headless engine executes a profile; a placeholder rectangle moves from recorded snapshots. No art, no UI polish.

**Owner:** Integration lead + Physics agent jointly (this milestone predates workstream separation).

### Milestone 1 — Horizontal kinematics MVP

Workstream ownership per §16 table:

| Task | Workstream |
| --- | --- |
| Trolley physics: integration, velocity/accel clamping, actuator limits (§8.3) | Physics and scenarios |
| Manual controller: key state → target acceleration/braking (§6.2) | Controls and UI |
| Three-phase automated profile editor: add/remove/reorder/duplicate, validation, unit labels (§6.3) | Controls and UI |
| Position/velocity/acceleration recording at fixed sample rate (§9.1) | Analysis and quality |
| Render crane/trolley/container/source/target with placeholder art | Rendering and assets |
| Success/failure evaluator against §7.1/§7.2 conditions | Physics and scenarios |
| Run state machine (Ready→Running→Paused→Complete/Failed→Review) (§7) | Controls and UI, consumed by all |

**Exit:** a student can go manual → automated → run → pass/fail, with placeholder art, end to end.

### Milestone 2 — Analysis and classroom readiness

- [ ] Aligned x-t / v-t / a-t graphs, shared cursor, phase/violation markers (§9.2)
- [ ] Replay from snapshots + scrubber (§6.1)
- [ ] CSV export + JSON run-summary export (§9.4)
- [ ] Tutorial scenario + concise in-app instructions
- [ ] Local draft persistence, versioned autosave (§12.2)
- [ ] Full accessibility pass (§12.1): labeled equivalents, focus order, live region, non-color status, 200% zoom
- [ ] Cross-browser smoke tests (Chromium/Firefox/WebKit)
- [ ] Pilot with ≥3 users unfamiliar with the controls; log confusion points

**Exit:** the kinematics lab runs for a class without developer intervention.

### Milestone 3 — Art and animation pass

- [ ] Replace placeholder geometry with production sprites (see asset list doc)
- [ ] Layered port scene, trolley/spreader animation states, cutaway cargo
- [ ] Restrained feedback animations (impact/secured/delivered)
- [ ] Validate collision geometry against final art (hitboxes stay data, not baked into sprites — §8.7)
- [ ] Asset loading + Canvas LMS embed performance pass

**Exit:** visually memorable; zero change to physics results or lab workflow.

### Milestone 4 — Full crane cycle

- [ ] Vertical hoist motion, cable-length state (§8.4)
- [ ] Attach/lower/release sequence and attachment state machine
- [ ] Sway model (damped pendulum, §8.5) with unit-tested variable-length term
- [ ] Cargo-shift physics (§8.6): friction transition, wall impact, damage
- [ ] Clearance obstacles + full-cycle scenario (§10.2 #4)

**Exit:** one complete ship-to-shore transfer, manual and automated.

### Milestone 5 — Reusable course modules

- [ ] Dynamics: force/friction overlays
- [ ] Statics: pause/freeze + reaction-force overlay
- [ ] Energy/power: peak power, total energy, optional regeneration
- [ ] Controls: feedback controller mode, sensor noise, gain tuning, anti-sway
- [ ] Optimization: multi-cargo, Pareto comparison

**Exit:** ≥3 distinct ENGR-120 labs share the engine/scene with no duplicated core code.

---

## 2. Parallel workstream map (post-Milestone-0)

Direct from spec §16, restated as an ownership contract:

| Workstream | Owns | Must not touch |
| --- | --- | --- |
| Physics and scenarios | `src/sim/**`, scenario schema, golden fixtures | `src/renderer`, DOM controls |
| Controls and UI | `src/controllers`, `src/ui`, accessibility | Physics calculations |
| Rendering and assets | `src/renderer`, coordinate transform, sprites, overlays | Authoritative motion state |
| Analysis and quality | `src/analysis`, browser tests | Scenario physics constants (no unreviewed edits) |

**Integration lead** owns contracts, scenario versioning, merge order, and definition of done — not delegated.

Integration rules to enforce (verbatim from §16, worth restating because they'll get violated first under deadline pressure):

1. Contracts + golden fixtures land before parallel work starts.
2. One directory, one primary owner.
3. Separate branches/worktrees per workstream.
4. Physics contract merges before renderer/UI invent substitute state.
5. Every physics change ships with a unit test.
6. Any change that affects expected run results bumps the scenario version.
7. Art swaps stay independent of collision geometry.
8. Integrate one vertical slice at a time (command → engine → snapshot → render → record → test), not four half-finished layers.
9. No workstream redesigns another's public interface without an explicit contract change, reviewed by the integration lead.

---

## 3. Open decisions to resolve before Milestone 0 starts

These aren't blocking in the sense of "can't write code," but leaving them open invites rework:

- **Numerical tolerances (§8.8):** pick actual numbers now (position, velocity-at-rest, angle-at-rest, float-equality, collision-contact, max frame gap) and put them in one config file. Don't let them get invented ad hoc during physics implementation.
- **Fragile Freight Transfer numeric tuning (§17):** the suggested values (30 m, 4.0 m/s, 0.80 m/s²) are a starting point — confirm they produce a "clean" triangular/trapezoidal solution before locking the golden fixtures, since the fixtures get expensive to regenerate later.
- **Hosting target for Canvas LMS embed:** where does the static build actually live (S3/Netlify/Vercel/institutional host)? Affects the "no pop-ups, no external requests after load" constraint (§12.2) and iframe sizing.
- **Art style reference:** §5.1 asks for "16-bit-inspired industrial style consistent with the existing ENGR-120 visual identity" — that identity needs a reference sheet (palette, line weight, existing course assets if any) before an artist or image-gen pipeline starts on Milestone 3 sprites.
- **Instructor content workflow for now:** confirmed as repo-file editing only for v1 (§10.3) — worth stating explicitly to whoever's tempted to build a config UI early.

---

## 4. Suggested first sprint (concrete next actions)

1. Write `AGENTS.md` and the ADR (½ day).
2. Draft the TypeScript contracts file (`src/sim/model/*.ts` stubs) and circulate for review — this is the highest-leverage single file in the project.
3. Draft `scenarios/schema.ts` + `fragile-freight.json` using §17's starting values.
4. Write 3–5 golden vectors: constant acceleration, triangular profile to rest, trapezoidal profile to rest, a deliberately-invalid profile (exceeds speed limit).
5. Stand up Vite + Vitest + Playwright skeleton, CI running on push.
6. Build the placeholder-rectangle renderer against the frozen snapshot contract.

Once (1)–(6) are done, Milestone 1 work can fan out across the four workstreams.
