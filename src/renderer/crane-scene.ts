// Phaser scene renderer. Owns only visual objects (ADR-0001, spec §11.5)
// — every frame it ticks the RunOrchestrator (which owns the fixed-step
// accumulator and engine) and then draws whatever SimulationSnapshot came
// out of that. It never computes trolley position itself, and it has no
// idea whether manual or automated control produced the snapshot.
//
// All telemetry text, results, and controls live in the DOM (src/ui/**)
// per spec §5.1 ("DOM-based controls and labels so text remains sharp and
// accessible") — this scene draws the physical scene only.
//
// Art status (Milestone 3, in progress): trolley, spreader, container,
// transfer chassis, and the ship-to-shore crane structure are in from
// src/assets/sprites/, and the port/ship/water/sky background is in from
// src/assets/backgrounds/. Still pending: multiple container colors +
// cutaway variant, spreader/beacon animation frames, foreground safety
// barriers.

import Phaser from 'phaser';
import type { RunOrchestrator } from '../app/app-state';
import { SCENE_HEIGHT_PX, SCENE_WIDTH_PX, createCoordinateTransform, type CoordinateTransform } from './coordinate-transform';
import { drawDashedRect } from './overlays';
import { SPRITE_KEYS, SPRITE_MANIFEST } from './sprites';

const SOURCE_ZONE_COLOR = 0xd23c3c;
const TARGET_ZONE_COLOR = 0x2fa84f;
const CABLE_COLOR = 0x30343a;

// Uniform scale applied to every crane/vehicle sprite so they stay in
// consistent proportion to each other (the art was drawn at a shared
// native scale — see the size comments in src/assets/README.md/asset
// list). Tune this one number to resize the whole rig together. The
// background happens to share this exact scale too (640x360 -> 960x540),
// which is a coincidence worth knowing about, not something to rely on —
// buildStaticScene() computes the background's own fit independently.
const ART_SCALE = 1.5;

// Where the quay's surface (the flat dock the crane and chassis stand on)
// sits as a fraction of the background image's height, measured from the
// top by sampling the art directly. The crane structure's ground line —
// where its wheels meet the quay — is derived from this, so the whole rig
// sits on the actual drawn dock line rather than an independently guessed
// pixel row.
const BACKGROUND_QUAY_FRACTION = 306 / 360;

// Where the boom's underside (the trolley rail) sits as a fraction of the
// crane structure image's native height, measured from the top. Verified
// against the actual sprite by rendering and inspecting.
const CRANE_RAIL_FRACTION = 0.315;

const HOIST_DROP_PX = 90; // trolley rail to container top, fixed travel height (vertical motion not modeled yet)
const SPREADER_GAP_PX = 4; // small visual gap between spreader and container top

export interface CraneSceneData {
  orchestrator: RunOrchestrator;
}

export class CraneScene extends Phaser.Scene {
  private orchestrator!: RunOrchestrator;
  private transform!: CoordinateTransform;

  private railY_px = 0;
  private containerTopY_px = 0;
  private spreaderY_px = 0;
  private containerCenterY_px = 0;

  private trolleySprite!: Phaser.GameObjects.Image;
  private spreaderSprite!: Phaser.GameObjects.Image;
  private containerSprite!: Phaser.GameObjects.Image;
  private cableGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super('crane-scene');
  }

  init(data: CraneSceneData): void {
    this.orchestrator = data.orchestrator;
  }

  preload(): void {
    for (const { key, url } of SPRITE_MANIFEST) this.load.image(key, url);
  }

  create(): void {
    this.transform = createCoordinateTransform(this.orchestrator.scenario);
    this.buildStaticScene();

    this.trolleySprite = this.add.image(0, this.railY_px, SPRITE_KEYS.trolley).setScale(ART_SCALE).setOrigin(0.5, 1);
    this.spreaderSprite = this.add
      .image(0, this.spreaderY_px, SPRITE_KEYS.spreader)
      .setScale(ART_SCALE)
      .setOrigin(0.5, 0);
    this.containerSprite = this.add
      .image(0, this.containerTopY_px, SPRITE_KEYS.containerOrange)
      .setScale(ART_SCALE)
      .setOrigin(0.5, 0);
    this.cableGraphics = this.add.graphics();

    this.renderFromSnapshot();
  }

  private buildStaticScene(): void {
    this.cameras.main.setBackgroundColor('#bfe3f0'); // shows only if the background image is narrower than expected

    const backgroundTexture = this.textures.get(SPRITE_KEYS.portBackground).getSourceImage();
    const backgroundScale = SCENE_WIDTH_PX / backgroundTexture.width;
    this.add.image(0, 0, SPRITE_KEYS.portBackground).setScale(backgroundScale).setOrigin(0, 0);
    const backgroundScaledHeight = backgroundTexture.height * backgroundScale;
    const groundY_px = backgroundScaledHeight * BACKGROUND_QUAY_FRACTION;

    const craneTexture = this.textures.get(SPRITE_KEYS.stsCraneStructure).getSourceImage();
    const craneScaledHeight = craneTexture.height * ART_SCALE;
    const craneTopY_px = groundY_px - craneScaledHeight;
    this.add
      .image(SCENE_WIDTH_PX / 2, groundY_px, SPRITE_KEYS.stsCraneStructure)
      .setScale(ART_SCALE)
      .setOrigin(0.5, 1);

    this.railY_px = craneTopY_px + craneScaledHeight * CRANE_RAIL_FRACTION;
    this.containerTopY_px = this.railY_px + HOIST_DROP_PX;

    const containerTexture = this.textures.get(SPRITE_KEYS.containerOrange).getSourceImage();
    const spreaderTexture = this.textures.get(SPRITE_KEYS.spreader).getSourceImage();
    this.containerCenterY_px = this.containerTopY_px + (containerTexture.height * ART_SCALE) / 2;
    this.spreaderY_px = this.containerTopY_px - SPREADER_GAP_PX - spreaderTexture.height * ART_SCALE;

    const targetX_px = this.transform.xToPixels(this.orchestrator.scenario.geometry.targetX_m);
    this.add
      .image(targetX_px, groundY_px, SPRITE_KEYS.transferChassis)
      .setScale(ART_SCALE)
      .setOrigin(0.5, 1);

    const zoneGraphics = this.add.graphics();
    const sourceX_px = this.transform.xToPixels(this.orchestrator.scenario.geometry.initialX_m);
    drawDashedRect(zoneGraphics, sourceX_px, this.containerCenterY_px, 90, 60, SOURCE_ZONE_COLOR);
    drawDashedRect(zoneGraphics, targetX_px, this.containerCenterY_px, 90, 60, TARGET_ZONE_COLOR);
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
    this.trolleySprite.x = x_px;
    this.spreaderSprite.x = x_px;
    this.containerSprite.x = x_px;

    this.cableGraphics.clear();
    this.cableGraphics.lineStyle(2, CABLE_COLOR, 1);
    this.cableGraphics.lineBetween(x_px, this.railY_px, x_px, this.spreaderY_px);
  }
}

export { SCENE_WIDTH_PX, SCENE_HEIGHT_PX };
