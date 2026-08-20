import Phaser from 'phaser';
import { OverheadScene, type OverheadSceneData } from './renderer/overhead-scene';
import { SCENE_HEIGHT_PX, SCENE_WIDTH_PX } from './renderer/coordinate-transform-2d';
import type { GantryOrchestrator } from './orchestrator';

export function bootstrap(parent: string | HTMLElement, orchestrator: GantryOrchestrator): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: SCENE_WIDTH_PX,
    height: SCENE_HEIGHT_PX,
    backgroundColor: '#d7dde3',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });

  const sceneData: OverheadSceneData = { orchestrator };
  game.scene.add('overhead-scene', OverheadScene, true, sceneData);

  return game;
}
