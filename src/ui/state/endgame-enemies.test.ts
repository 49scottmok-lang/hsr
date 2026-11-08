import { expect, it } from 'vitest';
import { ENEMY_TABLES, stageEnemies, type StageEnemy } from '../../data';
import type { EnemyConfig } from '../../engine/index';
import { importScenario } from './scenario-json';
import { addStageEnemy, applyStageEnemies } from './endgame-enemies';

function wave(stageId: string, index: number): readonly StageEnemy[] {
  const r = stageEnemies(ENEMY_TABLES, stageId);
  if (!r.ok) throw new Error(r.reason);
  return r.value[index]!;
}

// TEST FIXTURE — NOT GAME DATA
const typed = (id: string): EnemyConfig => ({ id, name: 'typed', level: 1, res: {}, broken: true });

it('replaces enemies in order, keeping their IDs, and keeps the rest', () => {
  const boss = wave('30126121', 1); // MoC 物競天擇 floor 12 node 1, wave 2: one boss
  const out = applyStageEnemies([typed('target'), typed('second')], boss, ['target', 'second', 'dps']);
  expect(out.map((e) => e.id)).toEqual(['target', 'second']);
  expect(out[0]).toMatchObject({ id: 'target', name: boss[0]!.enemy.name, level: 95, spd: boss[0]!.spd });
  expect(out[0]?.broken).toBeUndefined();
  expect(out[1]).toEqual(typed('second'));
});

it('gives extra enemies fresh IDs that avoid every unit', () => {
  const two = wave('30126121', 0);
  expect(two).toHaveLength(2);
  const out = applyStageEnemies([], two, ['enemy-1', 'dps']);
  expect(out.map((e) => e.id)).toEqual(['enemy-2', 'enemy-3']);
});

it('adds one enemy under a new ID', () => {
  const [boss] = wave('30126121', 1);
  const out = addStageEnemy([typed('enemy-1')], boss!, ['enemy-1']);
  expect(out.map((e) => e.id)).toEqual(['enemy-1', 'enemy-2']);
});

it('keeps a picked enemy through a scenario file round trip', () => {
  const enemies = applyStageEnemies([], wave('30126121', 1), []);
  const json = JSON.stringify({ critMode: 'expected', enemies, teams: [{ label: 'A', team: [], events: [] }, { label: 'B', team: [], events: [] }] });
  const result = importScenario(json);
  expect(result.ok && result.scenario.enemies).toEqual(enemies);
});
