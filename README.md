# Portside Motion Lab

ENGR-120 kinematics simulator — a 2D gantry-crane trolley-motion lab. See:

- [`portside-motion-lab-spec.md`](portside-motion-lab-spec.md) — product and implementation specification
- [`portside-motion-lab-plan.md`](portside-motion-lab-plan.md) — milestone plan and workstream ownership
- [`portside-motion-lab-asset-list.md`](portside-motion-lab-asset-list.md) — sprite/asset manifest
- [`AGENTS.md`](AGENTS.md) — repository rules and directory ownership for parallel work
- [`docs/adr-0001-physics-rendering-separation.md`](docs/adr-0001-physics-rendering-separation.md) — why physics and rendering are separate modules

## Status

Milestone 0 in progress: core contracts, scenario schema, a deterministic horizontal-trolley engine, manual/profile controllers, and golden physics fixtures are implemented and tested. No renderer or UI yet — Phaser is a dependency but nothing imports it.

## Commands

```sh
npm install
npm test          # run unit tests once
npm run test:watch
npm run typecheck
npm run dev        # Vite dev server (nothing to see yet — no UI/renderer)
npm run build
```

## Layout

See `AGENTS.md` for the full ownership table. Implemented so far:

```text
src/
  sim/
    model/        # state, commands, snapshot, tolerances — the frozen contracts
    physics/       # pure trolley integration + fixed-step accumulator
    engine.ts      # DeterministicEngine (horizontal trolley only, Milestone 0/1 scope)
    metrics.ts     # requirement evaluation, run metrics
  controllers/
    manual-controller.ts
    profile-controller.ts
    controller-types.ts
  scenarios/
    schema.ts      # zod schema for ScenarioConfig
    loader.ts       # validated JSON loading
    fragile-freight.json
    tutorial.json
tests/
  unit/            # trolley physics, accumulator, schema, golden-vector runner
  fixtures/golden-vectors/  # hand-computed physics fixtures (spec §14.2)
```
