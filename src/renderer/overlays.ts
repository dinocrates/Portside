// Vector overlays: zone outlines, cable, and (later) position/velocity/
// acceleration/force arrows. Spec §5.4 / §8.7: "cables, arrows, paths,
// target outlines, and graph marks should be drawn as vectors rather than
// baked into sprites." Nothing here is authoritative state — it only
// draws what a SimulationSnapshot already says (ADR-0001).

import type Phaser from 'phaser';

function drawDashedLine(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash: number,
  gap: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;

  let pos = 0;
  g.beginPath();
  while (pos < len) {
    const segStart = pos;
    const segEnd = Math.min(pos + dash, len);
    g.moveTo(x1 + ux * segStart, y1 + uy * segStart);
    g.lineTo(x1 + ux * segEnd, y1 + uy * segEnd);
    pos += dash + gap;
  }
  g.strokePath();
}

/** Dashed rectangle outline, centered at (x, y), per the placeholder asset spec (source/target zone markers). */
export function drawDashedRect(
  g: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  color: number,
  dash = 6,
  gap = 4,
): void {
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = centerY - height / 2;
  const bottom = centerY + height / 2;

  g.lineStyle(2, color, 1);
  drawDashedLine(g, left, top, right, top, dash, gap);
  drawDashedLine(g, right, top, right, bottom, dash, gap);
  drawDashedLine(g, right, bottom, left, bottom, dash, gap);
  drawDashedLine(g, left, bottom, left, top, dash, gap);
}
