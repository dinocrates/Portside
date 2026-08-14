// Phaser scene renderer. Milestone 0 exit criterion (spec §15): "A headless
// engine executes a profile and a placeholder rectangle moves from
// recorded snapshots." This scene owns only visual objects (ADR-0001,
// spec §11.5) — every frame it reads the latest SimulationSnapshot and
// draws it; it never computes trolley position itself.
//
// Scope: runs the Fragile Freight Transfer scenario's analytically-correct
// trapezoidal profile (the same one proven in
// tests/fixtures/golden-vectors/trapezoidal-success.json) automatically on
// load, using placeholder rectangles (asset list §1) since no production
// art exists yet. Manual controls, the profile editor, and run-control UI
// are Milestone 1 scope, not this pass.

import Phaser from 'phaser';
import { DeterministicEngine } from '../sim/engine';
import { ProfileController, type MotionProfile } from '../controllers/profile-controller';
import { FixedStepAccumulator } from '../sim/physics/integrator';
import { DEFAULT_PHYSICS_DT_S, DEFAULT_TOLERANCES } from '../sim/model/parameters';
import { validateScenario } from '../scenarios/loader';
import type { ScenarioConfig } from '../scenarios/schema';
import fragileFreightJson from '../scenarios/fragile-freight.json';
import type { SimulationSnapshot } from '../sim/model/snapshot';
import {
  CONTAINER_Y_PX,
  QUAY_TOP_Y_PX,
  SCENE_HEIGHT_PX,
  SCENE_WIDTH_PX,
  TROLLEY_RAIL_Y_PX,
  createCoordinateTransform,
  type CoordinateTransform,
} from './coordinate-transform';
import { drawDashedRect } from './overlays';

// Same trapezoidal profile as the golden fixture: analytically correct for
// 30 m at aMax=0.8 m/s^2, vMax=4.0 m/s (spec §17).
const DEMO_PROFILE: MotionProfile = [
  { id: 'accelerate', name: 'Accelerate', duration_s: 5.0, trolleyAcceleration_mps2: 0.8 },
  { id: 'cruise', name: 'Cruise', duration_s: 2.5, trolleyAcceleration_mps2: 0.0 },
  { id: 'decelerate', name: 'Decelerate', duration_s: 5.0, trolleyAcceleration_mps2: -0.8 },
];

const TROLLEY_COLOR = 0x2f6fed; // blue placeholder (asset list §1)
const CONTAINER_COLOR = 0xe8871e; // orange placeholder
const QUAY_COLOR = 0x8a8f98;
const RAIL_COLOR = 0x50565f;
const SOURCE_ZONE_COLOR = 0xd23c3c;
const TARGET_ZONE_COLOR = 0x2fa84f;
const CABLE_COLOR = 0x30343a;

export class CraneScene extends Phaser.Scene {
  private engine = new DeterministicEngine();
  private controller!: ProfileController;
  private scenario!: ScenarioConfig;
  private accumulator!: FixedStepAccumulator;
  private snapshot!: SimulationSnapshot;
  private transform!: CoordinateTransform;

  private trolleyRect!: Phaser.GameObjects.Rectangle;
  private containerRect!: Phaser.GameObjects.Rectangle;
  private cableGraphics!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  constructor() {
    super('crane-scene');
  }

  create(): void {
    this.scenario = validateScenario(fragileFreightJson);
    this.transform = createCoordinateTransform(this.scenario);
    this.accumulator = new FixedStepAccumulator({
      fixedDt_s: DEFAULT_PHYSICS_DT_S,
      maxAcceptedFrameGap_s: DEFAULT_TOLERANCES.maxAcceptedFrameGap_s,
    });

    this.buildStaticScene();

    this.trolleyRect = this.add.rectangle(0, TROLLEY_RAIL_Y_PX, 64, 32, TROLLEY_COLOR);
    this.containerRect = this.add.rectangle(0, CONTAINER_Y_PX, 72, 48, CONTAINER_COLOR);
    this.cableGraphics = this.add.graphics();

    this.statusText = this.add.text(16, 16, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#102030',
    });
    this.resultText = this.add
      .text(SCENE_WIDTH_PX / 2, 60, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#102030',
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    this.input.keyboard?.on('keydown-R', () => this.startRun());

    this.startRun();
  }

  private buildStaticScene(): void {
    this.cameras.main.setBackgroundColor('#bfe3f0');

    // Quay / ground (placeholder tier, asset list §1: static gray rectangle).
    this.add.rectangle(SCENE_WIDTH_PX / 2, QUAY_TOP_Y_PX + 40, SCENE_WIDTH_PX, 80, QUAY_COLOR);
    // Trolley rail.
    this.add.rectangle(SCENE_WIDTH_PX / 2, TROLLEY_RAIL_Y_PX - 20, SCENE_WIDTH_PX - 40, 6, RAIL_COLOR);

    // Source / target zones — drawn as vectors, not sprites (spec §5.4, §8.7).
    const zoneGraphics = this.add.graphics();
    const sourceX = this.transform.xToPixels(this.scenario.geometry.initialX_m);
    const targetX = this.transform.xToPixels(this.scenario.geometry.targetX_m);
    drawDashedRect(zoneGraphics, sourceX, CONTAINER_Y_PX, 90, 60, SOURCE_ZONE_COLOR);
    drawDashedRect(zoneGraphics, targetX, CONTAINER_Y_PX, 90, 60, TARGET_ZONE_COLOR);
  }

  private startRun(): void {
    this.controller = new ProfileController(DEMO_PROFILE);
    this.accumulator.reset();
    this.snapshot = this.engine.reset(this.scenario, 'placeholder-render-demo');
    this.controller.reset(this.snapshot, this.scenario);
    this.resultText.setText('');
    this.renderFromSnapshot();
  }

  override update(_time: number, deltaMs: number): void {
    const isTerminal = this.snapshot.runState === 'complete' || this.snapshot.runState === 'failed';
    if (!isTerminal) {
      const steps = this.accumulator.addFrameTime(deltaMs / 1000);
      for (let i = 0; i < steps; i++) {
        const command = this.controller.command(this.snapshot, DEFAULT_PHYSICS_DT_S);
        this.snapshot = this.engine.step(command, DEFAULT_PHYSICS_DT_S);
        if (this.snapshot.runState === 'complete' || this.snapshot.runState === 'failed') break;
      }
    }
    this.renderFromSnapshot();
  }

  /**
   * The only place a SimulationSnapshot becomes pixels. Physics drives
   * animation (spec §3, principle 1) — nothing below this line ever
   * mutates simulation state.
   */
  private renderFromSnapshot(): void {
    const x_px = this.transform.xToPixels(this.snapshot.trolley_x_m);
    this.trolleyRect.x = x_px;
    this.containerRect.x = x_px;

    this.cableGraphics.clear();
    this.cableGraphics.lineStyle(2, CABLE_COLOR, 1);
    this.cableGraphics.lineBetween(x_px, TROLLEY_RAIL_Y_PX + 16, x_px, CONTAINER_Y_PX - 24);

    this.statusText.setText(
      [
        `t = ${this.snapshot.time_s.toFixed(2)} s`,
        `x = ${this.snapshot.trolley_x_m.toFixed(2)} m`,
        `v = ${this.snapshot.trolley_v_mps.toFixed(2)} m/s`,
        `a = ${this.snapshot.trolley_a_mps2.toFixed(2)} m/s²`,
        `state = ${this.snapshot.runState}`,
        '',
        '(R to rerun)',
      ].join('\n'),
    );

    if (this.snapshot.runState === 'complete') {
      this.resultText.setText('Delivered — run complete').setColor('#1f7a34');
    } else if (this.snapshot.runState === 'failed') {
      const failed = this.snapshot.requirementResults?.filter((r) => !r.satisfied) ?? [];
      const reasons = failed.map((r) => r.description).join(' / ') || 'requirement violated';
      this.resultText.setText(`Failed — ${reasons}`).setColor('#a52020');
    }
  }
}

export { SCENE_WIDTH_PX, SCENE_HEIGHT_PX };
