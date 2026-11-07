// @vitest-environment node
import { expect, it } from 'vitest';
import { importArchive, parseArchive } from '../../import';
import { archiveFixture, FAKE_UID } from '../../import/__tests__/fixtures';
import { IMPORT_TABLES } from '../../import/__tests__/tables';
import { decodeScenarioLink, encodeScenarioLink } from './scenario-link';
import type { Scenario } from '../state/scenario';

// TEST FIXTURE — NOT GAME DATA
const archive = parseArchive(archiveFixture());
if (!archive.ok) throw new Error('Expected a valid synthetic archive');
const { builds } = importArchive(archive.archive, IMPORT_TABLES);
const scenario: Scenario = {
  critMode: 'expected',
  enemies: [{ id: 'target', name: '測試敵人', level: 1, res: {}, maxToughness: 40 }],
  teams: [{
    label: '測試隊伍甲', team: builds,
    events: [{ id: 'test', actorId: builds[0]!.id, kind: 'turn', steps: [
      { op: 'break', hit: { kind: 'break', targetId: 'target' } },
      { op: 'break', hit: { kind: 'superBreak', targetId: 'target', toughnessReduction: 10, multiplier: 1 } },
    ] }],
  }, { label: '測試隊伍乙', team: builds, events: [] }],
};

it('round-trips a scenario with Unicode and imported builds through the compressed, versioned URL format', async () => {
  const hash = await encodeScenarioLink(scenario);
  expect(hash).toMatch(/^#s=1\.[A-Za-z0-9_-]+$/);
  await expect(decodeScenarioLink(hash)).resolves.toStrictEqual({ ok: true, scenario, issues: [] });
});

it('strips UID and inventory before encoding, even when unknown keys were attached to a scenario', async () => {
  const withPrivateData: Scenario = {
    ...scenario,
    teams: [{ ...scenario.teams[0], team: [{ ...builds[0]!, uid: FAKE_UID } as typeof builds[number]] }, scenario.teams[1]],
  };
  const hash = await encodeScenarioLink(Object.assign(withPrivateData, {
    metadata: { uid: FAKE_UID }, inventory: archiveFixture(), uid: FAKE_UID,
  }));
  // Byte-for-byte equality covers the encoder independently of the decoder's sanitizer.
  expect(hash).toBe(await encodeScenarioLink(scenario));
});

it('reports corrupted links and incompatible versions without throwing', async () => {
  const hash = await encodeScenarioLink(scenario);
  await expect(decodeScenarioLink(hash.slice(0, -8))).resolves.toEqual({
    ok: false, issues: ['Scenario: invalid link'],
  });
  await expect(decodeScenarioLink(hash.replace('s=1.', 's=0.'))).resolves.toEqual({
    ok: false, issues: ['Scenario: unsupported link version'],
  });
});
