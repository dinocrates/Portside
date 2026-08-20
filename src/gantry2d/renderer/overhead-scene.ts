// Phaser scene for the overhead gantry lab. Same discipline as the 1D
// lab's CraneScene (ADR-0001): reads GantryOrchestrator snapshots, never
// computes physics. Placeholder-tier visuals only, deliberately —
// reliable geometry over unfinished art, same lesson the 1D lab's art
// pass already paid for.
//
// Visual metaphor: two side rails run the full Y span; a bridge beam
// slides along them (the Y axis) and spans the playfield width; the claw
// slides along the bridge (the X axis). This is the actual mechanism a
// two-axis bridge/gantry crane uses, not just a schematic dot.

import Phaser from 'phaser';
import type { GantryOrchestrator } from '../orchestrator';
import {
  SCENE_HEIGHT_PX,
  SCENE_WIDTH_PX,
  createCoordinateTransform2D,
  type CoordinateTransform2D,
} from './coordinate-transform-2d';
import { drawDashedRect } from '../../renderer/overlays';

const CABINET_COLOR = 0xd7dde3;
const FIELD_COLOR = 0xeef2f6;
const FIELD_BORDER_COLOR = 0x50565f;
const RAIL_COLOR = 0x50565f;
const BRIDGE_COLOR = 0x2f6fed;
const CLAW_COLOR = 0xe8871e;
const SOURCE_ZONE_COLOR = 0xd23c3c;
const TARGET_ZONE_COLOR = 0x2fa84f;

export interface OverheadSceneData {
  orchestrator: GantryOrchestrator;
}

export class OverheadScene extends Phaser.Scene {
  private orchestrator!: GantryOrchestrator;
  private transform!: CoordinateTransform2D;

  private bridgeGraphics!: Phaser.GameObjects.Graphics;
  private clawRect!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('overhead-scene');
  }

  init(data: OverheadSceneData): void {
    this.orchestrator = data.orchestrator;
  }

  create(): void {
    this.transform = createCoordinateTransform2D(this.orchestrator.scenario);
    this.buildStaticScene();

    this.bridgeGraphics = this.add.graphics();
    this.clawRect = this.add.rectangle(0, 0, 22, 22, CLAW_COLOR).setStrokeStyle(2, 0x000000, 0.25);

    this.renderFromSnapshot();
  }

  private buildStaticScene(): void {
    this.cameras.main.setBackgroundColor('#' + CABINET_COLOR.toString(16).padStart(6, '0'));

    const { left, top, width, height } = this.transform.fieldPixelRect;

    this.add.rectangle(left + width / 2, top + height / 2, width, height, FIELD_COLOR).setStrokeStyle(2, FIELD_BORDER_COLOR);

    // Side rails (static — the bridge slides along these, drawn once).
    const railGraphics = this.add.graphics();
    railGraphics.lineStyle(5, RAIL_COLOR, 1);
    railGraphics.lineBetween(left, top, left, top + height);
    railGraphics.lineBetween(left + width, top, left + width, top + height);

    const zoneGraphics = this.add.graphics();
    const source = this.transform.toPixels(this.orchestrator.scenario.geometry.initialX_m, this.orchestrator.scenario.geometry.initialY_m);
    const target = this.transform.toPixels(this.orchestrator.scenario.geometry.targetX_m, this.orchestrator.scenario.geometry.targetY_m);
    drawDashedRect(zoneGraphics, source.x, source.y, 46, 46, SOURCE_ZONE_COLOR);
    drawDashedRect(zoneGraphics, target.x, target.y, 46, 46, TARGET_ZONE_COLOR);
  }

  override update(_time: number, deltaMs: number): void {
    this.orchestrator.tick(deltaMs / 1000);
    this.renderFromSnapshot();
  }

  /** The only place a GantrySnapshot becomes pixels. */
  private renderFromSnapshot(): void {
    const snapshot = this.orchestrator.getSnapshot();
    const { left, width } = this.transform.fieldPixelRect;
    const point = this.transform.toPixels(snapshot.x_m, snapshot.y_m);

    this.bridgeGraphics.clear();
    this.bridgeGraphics.lineStyle(6, BRIDGE_COLOR, 1);
    this.bridgeGraphics.lineBetween(left, point.y, left + width, point.y);

    this.clawRect.setPosition(point.x, point.y);
  }
}

export { SCENE_WIDTH_PX, SCENE_HEIGHT_PX };
