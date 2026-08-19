// Sprite manifest for the production art pass (Milestone 3). Each entry
// pairs a Phaser texture key with its Vite-resolved URL; CraneScene loads
// these in preload() and looks them up by key. New art drops into
// src/assets/sprites/ per the manifest in
// portside-motion-lab-asset-list.md — add the import + entry here (and,
// if it's a genuinely new piece rather than filling an existing slot,
// a line in that manifest) to make it loadable.
//
import trolleyUrl from '../assets/sprites/trolley.png';
import spreaderUrl from '../assets/sprites/spreader.png';
import containerOrangeUrl from '../assets/sprites/container-orange.png';
import transferChassisUrl from '../assets/sprites/transfer-chassis.png';
import stsCraneStructureUrl from '../assets/sprites/sts-crane-structure.png';
import portBackgroundUrl from '../assets/backgrounds/port-with-bow-ship-background-640x360-v1.png';

export const SPRITE_KEYS = {
  trolley: 'trolley',
  spreader: 'spreader',
  containerOrange: 'container-orange',
  transferChassis: 'transfer-chassis',
  stsCraneStructure: 'sts-crane-structure',
  portBackground: 'port-background',
} as const;

export interface SpriteManifestEntry {
  key: string;
  url: string;
}

export const SPRITE_MANIFEST: SpriteManifestEntry[] = [
  { key: SPRITE_KEYS.trolley, url: trolleyUrl },
  { key: SPRITE_KEYS.spreader, url: spreaderUrl },
  { key: SPRITE_KEYS.containerOrange, url: containerOrangeUrl },
  { key: SPRITE_KEYS.transferChassis, url: transferChassisUrl },
  { key: SPRITE_KEYS.stsCraneStructure, url: stsCraneStructureUrl },
  { key: SPRITE_KEYS.portBackground, url: portBackgroundUrl },
];
