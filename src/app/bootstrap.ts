// Phaser game bootstrap. This is the only file that constructs a
// Phaser.Game — everything else (renderer, sim, controllers) stays
// independent of how/whether a game instance exists, per ADR-0001.

import Phaser from 'phaser';
import { CraneScene } from '../renderer/crane-scene';
import { SCENE_HEIGHT_PX, SCENE_WIDTH_PX } from '../renderer/coordinate-transform';

export function bootstrap(parent: string | HTMLElement): Phaser.Game {
  return new Phaser.Game({
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
    scene: [CraneScene],
  });
}
