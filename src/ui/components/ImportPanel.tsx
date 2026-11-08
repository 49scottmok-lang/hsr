import { useRef, useState } from 'react';
import type { CharacterBuild } from '../../engine/index';
import { formatNumber, t } from '../i18n';
import { prepareAccountImport } from '../state/account-import';
import type { Scenario, TeamIndex } from '../state/scenario';
import { IssueList } from './IssueList';

interface ImportPanelProps {
  scenario: Scenario;
  onAdd: (teamIndex: TeamIndex, build: CharacterBuild) => void;
}

// Collapsed by default so a large account export doesn't push the rest of the page down.
function ReportList({ label, items, open = false }: { label: string; items: readonly string[]; open?: boolean }) {
  if (!items.length) return null;
  return (
    <details open={open}>
      <summary>{t('import.reportCount').replace('{count}', formatNumber(items.length)).replace('{label}', () => label)}</summary>
      <IssueList issues={items} />
    </details>
  );
}

export function ImportPanel({ scenario, onAdd }: ImportPanelProps) {
  const [result, setResult] = useState<ReturnType<typeof prepareAccountImport>>();
  const fileRead = useRef(0);

  async function load(file: File) {
    const read = ++fileRead.current;
    setResult(undefined);
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (read === fileRead.current) setResult({ ok: false, errors: [t('import.error.read')] });
      return;
    }
    if (read !== fileRead.current) return;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      setResult({ ok: false, errors: [t('issue.invalidJson')] });
      return;
    }
    setResult(prepareAccountImport(json));
  }

  return (
    <section aria-label={t('import.title')}>
      <h2>{t('import.title')}</h2>
      <p>{t('import.localOnly')}</p>
      <label>
        {t('import.file')}
        <input type="file" accept=".json,application/json" onChange={({ currentTarget }) => {
          const file = currentTarget.files?.[0];
          currentTarget.value = '';
          if (file) void load(file);
        }} />
      </label>
      {result && !result.ok && <div role="alert"><IssueList issues={result.errors} /></div>}
      {result?.ok && (
        <>
          {result.warnings.length > 0 && <div role="status">
            <p>{t('import.warnings')}</p>
            <IssueList issues={result.warnings} />
          </div>}
          <p>{t('import.dropped')
            .replace('{cones}', formatNumber(result.dropped.lightCones))
            .replace('{relics}', formatNumber(result.dropped.relics))}</p>
          {result.entries.length === 0 && <p>{t('import.noCharacters')}</p>}
          <div className="card-grid import-grid">
          {result.entries.map(({ id, name, level, eidolon, cone, sets, build, lookedUp, toEnter, problems }) => (
            <fieldset key={id}>
              <legend>{name}</legend>
              {/* Each dt/dd pair needs its own div: the shared dl grid styles the div as one label–value cell. */}
              <dl>
                <div><dt>{t('character.level')}</dt><dd>{formatNumber(level)}</dd></div>
                <div><dt>{t('term.eidolon')}</dt>
                  <dd>{t('character.eidolonRank').replace('{rank}', formatNumber(eidolon))}</dd></div>
                <div><dt>{t('term.lightCone')}</dt>
                  <dd>{cone ? t('import.equippedCone').replace('{rank}', formatNumber(cone.superimposition))
                    .replace('{name}', () => cone.name) : t('results.none')}</dd></div>
                <div><dt>{t('term.relics')}</dt>
                  <dd>{sets.length ? sets.map((set) => t('import.relicCount')
                    .replace('{count}', formatNumber(set.count)).replace('{name}', () => set.name))
                    .join(t('results.separator')) : t('results.none')}</dd></div>
              </dl>
              <ReportList label={t('import.problems')} items={problems} open />
              <ReportList label={t('import.toEnter')} items={toEnter} />
              <ReportList label={t('import.lookedUp')} items={lookedUp} />
              {build && scenario.teams.map(({ label, team }, index) => {
                const conflict = [...team, ...scenario.enemies].some((unit) => unit.id === build.id);
                const key = conflict ? 'import.alreadyAdded' : team.length >= 4 ? 'import.teamFull' : 'import.add';
                return <button key={index} type="button" disabled={key !== 'import.add'}
                  onClick={() => onAdd(index === 0 ? 0 : 1, build)}>{t(key).replace('{team}', () => label)}</button>;
              })}
            </fieldset>
          ))}
          </div>
        </>
      )}
    </section>
  );
}
