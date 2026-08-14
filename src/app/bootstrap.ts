// Phaser game bootstrap. This is the only file that constructs a
// Phaser.Game — everything else (renderer, sim, controllers) stays
// independent of how/whether a game instance exists, per ADR-0001.

import Phaser from 'phaser';
import { CraneScene, type CraneSceneData } from '../renderer/crane-scene';
import { SCENE_HEIGHT_PX, SCENE_WIDTH_PX } from '../renderer/coordinate-transform';
import type { RunOrchestrator } from './app-state';

export function bootstrap(parent: string | HTMLElement, orchestrator: RunOrchestrator): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: SCENE_WIDTH_PX,
    height: SCENE_HEIGHT_PX,
    backgroundColor: '#bfe3f0',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });

  const sceneData: CraneSceneData = { orchestrator };
  game.scene.add('crane-scene', CraneScene, true, sceneData);

  return game;
}
