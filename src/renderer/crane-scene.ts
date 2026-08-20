// Phaser scene renderer. Owns only visual objects (ADR-0001, spec §11.5)
// — every frame it ticks the RunOrchestrator (which owns the fixed-step
// accumulator and engine) and then draws whatever SimulationSnapshot came
// out of that. It never computes trolley position itself, and it has no
// idea whether manual or automated control produced the snapshot.
//
// All telemetry text, results, and controls live in the DOM (src/ui/**)
// per spec §5.1 ("DOM-based controls and labels so text remains sharp and
// accessible") — this scene draws the physical scene only.

import Phaser from 'phaser';
import type { RunOrchestrator } from '../app/app-state';
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

const TROLLEY_COLOR = 0x2f6fed; // blue placeholder (asset list §1)
const CONTAINER_COLOR = 0xe8871e; // orange placeholder
const QUAY_COLOR = 0x8a8f98;
const RAIL_COLOR = 0x50565f;
const SOURCE_ZONE_COLOR = 0xd23c3c;
const TARGET_ZONE_COLOR = 0x2fa84f;
const CABLE_COLOR = 0x30343a;

export interface CraneSceneData {
  orchestrator: RunOrchestrator;
}

export class CraneScene extends Phaser.Scene {
  private orchestrator!: RunOrchestrator;
  private transform!: CoordinateTransform;

  private trolleyRect!: Phaser.GameObjects.Rectangle;
  private containerRect!: Phaser.GameObjects.Rectangle;
  private cableGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super('crane-scene');
  }

  init(data: CraneSceneData): void {
    this.orchestrator = data.orchestrator;
  }

  create(): void {
    this.transform = createCoordinateTransform(this.orchestrator.scenario);
    this.buildStaticScene();

    this.trolleyRect = this.add.rectangle(0, TROLLEY_RAIL_Y_PX, 64, 32, TROLLEY_COLOR);
    this.containerRect = this.add.rectangle(0, CONTAINER_Y_PX, 72, 48, CONTAINER_COLOR);
    this.cableGraphics = this.add.graphics();

    this.renderFromSnapshot();
  }

  private buildStaticScene(): void {
    this.cameras.main.setBackgroundColor('#bfe3f0');

    this.add.rectangle(SCENE_WIDTH_PX / 2, QUAY_TOP_Y_PX + 40, SCENE_WIDTH_PX, 80, QUAY_COLOR);
    this.add.rectangle(SCENE_WIDTH_PX / 2, TROLLEY_RAIL_Y_PX - 20, SCENE_WIDTH_PX - 40, 6, RAIL_COLOR);

    const zoneGraphics = this.add.graphics();
    const sourceX = this.transform.xToPixels(this.orchestrator.scenario.geometry.initialX_m);
    const targetX = this.transform.xToPixels(this.orchestrator.scenario.geometry.targetX_m);
    drawDashedRect(zoneGraphics, sourceX, CONTAINER_Y_PX, 90, 60, SOURCE_ZONE_COLOR);
    drawDashedRect(zoneGraphics, targetX, CONTAINER_Y_PX, 90, 60, TARGET_ZONE_COLOR);
  }

  override update(_time: number, deltaMs: number): void {
    this.orchestrator.tick(deltaMs / 1000);
    this.renderFromSnapshot();
  }

  /**
   * The only place a SimulationSnapshot becomes pixels. Physics drives
   * animation (spec §3, principle 1) — nothing below this line ever
   * mutates simulation state.
   */
  private renderFromSnapshot(): void {
    // getDisplaySnapshot(), not getSnapshot(): while replaying, this is the
    // recorded sample nearest the scrub cursor, not the (frozen) live
    // engine state — spec §13.4, "moving the replay cursor updates the
    // scene to the corresponding recorded sample."
    const snapshot = this.orchestrator.getDisplaySnapshot();
    const x_px = this.transform.xToPixels(snapshot.trolley_x_m);
    this.trolleyRect.x = x_px;
    this.containerRect.x = x_px;

    this.cableGraphics.clear();
    this.cableGraphics.lineStyle(2, CABLE_COLOR, 1);
    this.cableGraphics.lineBetween(x_px, TROLLEY_RAIL_Y_PX + 16, x_px, CONTAINER_Y_PX - 24);
  }
}

export { SCENE_WIDTH_PX, SCENE_HEIGHT_PX };
