# AGENTS.md — Portside Motion Lab

Rules for anyone (human or agent) working in this repository. See `portside-motion-lab-spec.md` for product intent and `portside-motion-lab-plan.md` for the milestone plan.

## Directory ownership

One primary owner per directory. Do not edit outside your workstream's owned paths without an explicit contract change reviewed by the integration lead.

| Workstream | Owns | Must not touch |
| --- | --- | --- |
| Physics and scenarios | `src/sim/**`, `src/scenarios/**`, `tests/fixtures/**` | `src/renderer/**`, `src/ui/**` |
| Controls and UI | `src/controllers/**`, `src/ui/**` | `src/sim/physics/**`, `src/sim/model/**` (types are read-only to this workstream) |
| Rendering and assets | `src/renderer/**`, `src/assets/**` | Anything that mutates `SimulationState` |
| Analysis and quality | `src/analysis/**`, `tests/e2e/**` | Scenario physics constants in `src/scenarios/**` without review |

Shared, contract-owned by the integration lead — anyone may read, only the integration lead approves changes:

- `src/sim/model/*.ts` (state, commands, snapshot, parameters)
- `src/controllers/controller-types.ts`
- `src/scenarios/schema.ts`

## Hard rules

1. **The simulation engine (`src/sim/**`) never imports Phaser, browser DOM APIs, chart code, or storage code.** See `docs/adr-0001-physics-rendering-separation.md`. This is enforced by code review, and should eventually be enforced by an ESLint import-boundary rule.
2. **Physics values are never stored in pixels.** SI units only inside `src/sim`. Pixel conversion happens exactly once, in `src/renderer/coordinate-transform.ts`.
3. **Every physics change ships with a unit test.** No exceptions for "obviously correct" changes to `src/sim/physics/**`.
4. **Any change that affects expected run results bumps `ScenarioConfig.version`** for the affected scenario file. Golden fixtures pin behavior to a scenario version; a version bump is a signal to regenerate or explicitly update fixtures, not a paperwork step.
5. **Manual and automated control both produce a `ControlCommand` consumed by the same `SimulationEngine`.** Do not special-case manual input inside the engine.
6. **Renderer and analysis code treat `SimulationSnapshot` (and completed run records) as immutable input.** They read; they do not compute physics.
7. **No workstream redesigns another's public interface without an explicit contract change**, reviewed by the integration lead.
8. **Tolerances live in `src/sim/model/parameters.ts`, not scattered epsilon constants.** See spec §8.8.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck + production build
- `npm test` — run unit tests (Vitest) once
- `npm run test:watch` — Vitest watch mode
- `npm run typecheck` — typecheck only, no emit

## Integration lead

Owns contracts, scenario versioning, merge order, and definition of done for each milestone. This role is not delegated to a swarm (spec §16).
