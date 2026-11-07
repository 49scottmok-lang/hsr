import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA_COMMIT, DATA_CREDITS, DATA_TABLES } from '..';

const B_COMMIT = (
  JSON.parse(readFileSync(new URL('./reference-b.json', import.meta.url), 'utf8')) as { source: { commit: string } }
).source.commit;

describe('data credits (D4)', () => {
  it('credits the table source at the commit the tables were generated from', () => {
    const source = DATA_CREDITS.find((c) => c.role === 'tableSource');
    expect(source?.commit).toBe(DATA_COMMIT);
    const tableCommits = new Set(
      [...DATA_TABLES.characters, ...DATA_TABLES.lightCones, ...DATA_TABLES.relicMainStats, ...DATA_TABLES.setBonuses, ...DATA_TABLES.traces].map(
        (r) => `${r.source.repo}@${r.source.commit}`,
      ),
    );
    expect([...tableCommits]).toEqual([`${source?.repo}@${source?.commit}`]);
  });

  it('credits the cross-check source at the commit the reference was taken from', () => {
    expect(DATA_CREDITS.find((c) => c.role === 'crossCheck')?.commit).toBe(B_COMMIT);
  });

  it('every credit has a full commit SHA and a GitHub URL for its repo', () => {
    for (const c of DATA_CREDITS) {
      expect(c.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(c.url).toBe(`https://github.com/${c.repo}`);
    }
  });
});
