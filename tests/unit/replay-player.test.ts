import { describe, expect, it } from 'vitest';
import { RunOrchestrator } from '../../src/app/app-state';
import { ReplayPlayer } from '../../src/analysis/replay';
import { validateScenario } from '../../src/scenarios/loader';
import { DEFAULT_PHYSICS_DT_S } from '../../src/sim/model/parameters';
import fragileFreightJson from '../../src/scenarios/fragile-freight.json';

const scenario = validateScenario(fragileFreightJson);
const dt = DEFAULT_PHYSICS_DT_S;

function runToCompletion(orch: RunOrchestrator): void {
  orch.setMode('automated');
  orch.setProfile([
    { id: 'accelerate', name: 'Accelerate', duration_s: 5.0, trolleyAcceleration_mps2: 0.8 },
    { id: 'cruise', name: 'Cruise', duration_s: 2.5, trolleyAcceleration_mps2: 0.0 },
    { id: 'decelerate', name: 'Decelerate', duration_s: 5.0, trolleyAcceleration_mps2: -0.8 },
  ]);
  orch.start();
  const totalSteps = Math.ceil(13.5 / dt);
  for (let i = 0; i < totalSteps; i++) orch.tick(dt);
}

describe('ReplayPlayer', () => {
  it('does nothing before a run is replayable', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    const player = new ReplayPlayer(orch);
    player.play();
    expect(player.isPlaying()).toBe(false);
  });

  it('advances the replay cursor in real time while playing', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const player = new ReplayPlayer(orch);

    player.play();
    expect(orch.isReplayingNow()).toBe(true);
    expect(orch.getReplayTime_s()).toBeCloseTo(0, 6);

    player.tick(1000); // 1 second of frame time
    expect(orch.getReplayTime_s()).toBeCloseTo(1.0, 6);

    player.tick(500);
    expect(orch.getReplayTime_s()).toBeCloseTo(1.5, 6);
  });

  it('stops automatically at the end of the recorded run', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const player = new ReplayPlayer(orch);
    player.play();

    player.tick(60_000); // way past the run's ~12.7s length
    const bounds = orch.getReplayBounds()!;
    expect(orch.getReplayTime_s()).toBeCloseTo(bounds.max_s, 6);
    expect(player.isPlaying()).toBe(false);
  });

  it('pause stops advancing', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const player = new ReplayPlayer(orch);
    player.play();
    player.tick(500);
    player.pause();
    const at = orch.getReplayTime_s();
    player.tick(500);
    expect(orch.getReplayTime_s()).toBe(at);
  });

  it('replaying from the end restarts from the beginning', () => {
    const orch = new RunOrchestrator(scenario, 'seed');
    runToCompletion(orch);
    const player = new ReplayPlayer(orch);
    orch.startReplay();
    orch.scrubTo(orch.getReplayBounds()!.max_s);

    player.play();
    expect(orch.getReplayTime_s()).toBeCloseTo(0, 6);
  });
});
