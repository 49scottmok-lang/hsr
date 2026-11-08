import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { CritMode } from '../engine/index';
import { CharacterEditor } from './components/CharacterEditor';
import { DataFooter } from './components/DataFooter';
import { EffectEditor } from './components/EffectEditor';
import { EndgameEnemyPicker } from './components/EndgameEnemyPicker';
import { EnemyEditor } from './components/EnemyEditor';
import { ImportPanel } from './components/ImportPanel';
import { IssueList } from './components/IssueList';
import { PortraitCard } from './components/PortraitCard';
import { Results } from './components/Results';
import { RotationEditor } from './components/RotationEditor';
import { formatNumber, t } from './i18n';
import { decodeScenarioLink, isScenarioLink } from './share/scenario-link';
import { ShareButton } from './share/ShareButton';
import { suggestedBreakLevelMultiplier } from './state/break-level';
import { addStageEnemy, applyStageEnemies } from './state/endgame-enemies';
import { scenarioReducer } from './state/reducer';
import { editorIssues, scenarioIssues } from './state/scenario-issues';
import { importScenario, type ScenarioImportResult } from './state/scenario-json';
import { restoreScenario, saveScenario } from './state/scenario-storage';
import type { Scenario, TeamIndex } from './state/scenario';

const initialScenario: Scenario = {
  critMode: 'expected',
  enemies: [],
  teams: [
    { label: t('team.a'), team: [], events: [] },
    { label: t('team.b'), team: [], events: [] },
  ],
};
const critModes = ['expected', 'crit', 'nonCrit'] as const;

export default function App() {
  const [restored] = useState(restoreScenario);
  const [loaded, setLoaded] = useState(restored?.ok ? restored : undefined);
  const [loadErrors, setLoadErrors] = useState(restored?.ok === false ? restored.issues : undefined);
  const [scenario, dispatch] = useReducer(scenarioReducer, loaded?.scenario ?? initialScenario);
  const [showResults, setShowResults] = useState(false);
  // The character each team's editor shows, by index; clamped when members are removed.
  const [selected, setSelected] = useState<readonly [number, number]>([0, 0]);
  const issues = editorIssues(scenario, loaded?.scenario === scenario
    ? loaded.issues
    : showResults || loaded ? scenarioIssues(scenario) : []);
  const fileRead = useRef(0);
  const nextCharacterNumber = useRef(1);
  const nextEnemyNumber = useRef(1);

  const loadScenario = useCallback((result: ScenarioImportResult) => {
    setLoadErrors(result.ok ? undefined : result.issues);
    if (result.ok) {
      setLoaded(result);
      dispatch({ type: 'replaceScenario', scenario: result.scenario });
    }
  }, []);

  useEffect(() => saveScenario(scenario), [scenario]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadLink() {
      const { hash } = window.location;
      if (!isScenarioLink(hash)) return;
      const read = ++fileRead.current;
      const result = await decodeScenarioLink(hash);
      if (controller.signal.aborted || read !== fileRead.current || window.location.hash !== hash) return;
      // Consume the link so subsequent reloads restore the latest local edits.
      const url = new URL(window.location.href);
      url.hash = '';
      window.history.replaceState(window.history.state, '', url);
      loadScenario(result);
    }
    function onHashChange() { void loadLink(); }
    onHashChange();
    window.addEventListener('hashchange', onHashChange, { signal: controller.signal });
    return () => controller.abort();
  }, [loadScenario]);

  function resetScenario() {
    fileRead.current++;
    setLoaded(undefined);
    setLoadErrors(undefined);
    setShowResults(false);
    nextCharacterNumber.current = 1;
    nextEnemyNumber.current = 1;
    dispatch({ type: 'replaceScenario', scenario: initialScenario });
  }

  async function readScenarioFile(file: File) {
    const read = ++fileRead.current;
    let result: ScenarioImportResult;
    try {
      result = importScenario(await file.text());
    } catch {
      result = { ok: false, issues: ['Scenario: unreadable file'] };
    }
    if (read === fileRead.current) loadScenario(result);
  }

  function unitIds(): string[] {
    return [...scenario.enemies, ...scenario.teams.flatMap(({ team }) => team)].map(({ id }) => id);
  }

  function addEnemy() {
    const units = [...scenario.enemies, ...scenario.teams.flatMap(({ team }) => team)];
    const ids = new Set(units.map(({ id }) => id));
    let id: string;
    do {
      id = `enemy-${nextEnemyNumber.current++}`;
    } while (ids.has(id));
    dispatch({ type: 'editEnemies', edit: { type: 'add', value: { id, name: '', level: 1, res: {} } } });
  }

  function addCharacter(teamIndex: TeamIndex) {
    const units = [...scenario.enemies, ...scenario.teams.flatMap(({ team }) => team)];
    const ids = new Set(units.map(({ id }) => id));
    let id: string;
    do {
      id = `character-${nextCharacterNumber.current++}`;
    } while (ids.has(id));

    dispatch({
      type: 'editCharacters',
      teamIndex,
      edit: {
        type: 'add',
        value: {
          id,
          name: '',
          level: 1,
          breakLevelMultiplier: suggestedBreakLevelMultiplier(1),
          element: 'physical',
          base: { hp: 0, atk: 0, def: 0, spd: 0 },
        },
      },
    });
    const index = scenario.teams[teamIndex].team.length;
    setSelected((value) => teamIndex === 0 ? [index, value[1]] : [value[0], index]);
  }

  function addEffect(teamIndex: TeamIndex) {
    const { effectLibrary, events } = scenario.teams[teamIndex];
    const ids = new Set(effectLibrary?.map(({ id }) => id));
    for (const { steps } of events) {
      for (const step of steps) {
        if (step.op === 'apply') ids.add(step.effect.id);
        if (step.op === 'remove') ids.add(step.effectId);
      }
    }
    let number = 1;
    while (ids.has(`effect-${number}`)) number++;
    dispatch({
      type: 'editEffects',
      teamIndex,
      edit: { type: 'add', value: { id: `effect-${number}`, name: '', kind: 'buff', modifiers: [] } },
    });
  }

  const selectedIndex = (teamIndex: TeamIndex) =>
    Math.min(selected[teamIndex], Math.max(scenario.teams[teamIndex].team.length - 1, 0));

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="brand">{t('app.title')}</h1>
          <nav className="topbar-nav" aria-label={t('nav.label')}>
            <a href="#enemies">{t('enemy.shared')}</a>
            {scenario.teams.map(({ label }, teamIndex) => <a key={teamIndex} href={`#team-${teamIndex}`}>{label}</a>)}
            <a href="#results">{t('results.title')}</a>
          </nav>
          <div className="topbar-actions">
            <label className="button file-button">
              {t('scenario.import')}
              <input type="file" accept=".json,application/json" onChange={({ currentTarget }) => {
                const file = currentTarget.files?.[0];
                currentTarget.value = '';
                if (file) void readScenarioFile(file);
              }} />
            </label>
            <button type="button" onClick={resetScenario}>{t('scenario.reset')}</button>
            <ShareButton scenario={scenario} />
          </div>
        </div>
      </header>
      <main className="app-shell">
        {loadErrors && <div role="alert" className="panel alert"><IssueList issues={loadErrors} /></div>}
        <ImportPanel scenario={scenario} onAdd={(teamIndex, value) => dispatch({
          type: 'editCharacters', teamIndex, edit: { type: 'add', value },
        })} />
        <section id="enemies" className="panel" aria-label={t('enemy.shared')}>
          <h2>{t('enemy.shared')}</h2>
          <IssueList issues={issues.get('enemies')} />
          <EndgameEnemyPicker
            onApplyWave={(wave) => dispatch({ type: 'setEnemies', enemies: applyStageEnemies(scenario.enemies, wave, unitIds()) })}
            onAdd={(enemy) => dispatch({ type: 'setEnemies', enemies: addStageEnemy(scenario.enemies, enemy, unitIds()) })}
          />
          <div className="card-grid">
            {scenario.enemies.map((enemy, index) => (
              <EnemyEditor
                key={index}
                enemy={enemy}
                issues={issues.get(`enemies[${index}]`)}
                onChange={(value) => dispatch({ type: 'editEnemies', edit: { type: 'update', index, value } })}
                onRemove={() => dispatch({ type: 'editEnemies', edit: { type: 'remove', index } })}
              />
            ))}
            <button type="button" className="add-card" onClick={addEnemy}>{t('enemy.add')}</button>
          </div>
        </section>
        {([0, 1] as const).map((teamIndex) => {
          const { label, team, effectLibrary = [] } = scenario.teams[teamIndex];
          const current = selectedIndex(teamIndex);
          const build = team[current];
          return (
            <section key={teamIndex} id={`team-${teamIndex}`} className="panel team-panel" data-team={teamIndex} aria-label={label}>
              <div className="panel-head">
                <h2>{label}</h2>
                <span className="panel-count">{t('team.members').replace('{count}', formatNumber(team.length))}</span>
              </div>
              <IssueList issues={issues.get(`teams[${teamIndex}]`)} />
              <div className="portrait-row">
                {team.map((member, index) => (
                  <PortraitCard
                    key={index}
                    build={member}
                    selected={index === current}
                    hasIssues={(issues.get(`teams[${teamIndex}].team[${index}]`)?.length ?? 0) > 0}
                    onSelect={() => setSelected((value) => teamIndex === 0 ? [index, value[1]] : [value[0], index])}
                  />
                ))}
                {team.length < 4 && (
                  <button type="button" className="portrait portrait-empty" onClick={() => addCharacter(teamIndex)}>
                    {t('character.add')}
                  </button>
                )}
              </div>
              {build && (
                <CharacterEditor
                  key={current}
                  build={build}
                  issues={issues.get(`teams[${teamIndex}].team[${current}]`)}
                  onChange={(value) => dispatch({ type: 'editCharacters', teamIndex, edit: { type: 'update', index: current, value } })}
                  onRemove={() => dispatch({ type: 'editCharacters', teamIndex, edit: { type: 'remove', index: current } })}
                />
              )}
              <fieldset className="effect-library">
                <legend>{t('effect.library')}</legend>
                <div className="card-grid">
                  {effectLibrary.map((effect, index) => (
                    <EffectEditor
                      key={index}
                      effect={effect}
                      units={[...team, ...scenario.enemies]}
                      reservedIds={new Set(effectLibrary.filter((_, i) => i !== index).map(({ id }) => id))}
                      onChange={(value) => dispatch({ type: 'editEffects', teamIndex, edit: { type: 'update', index, value } })}
                      onRemove={() => dispatch({ type: 'editEffects', teamIndex, edit: { type: 'remove', index } })}
                    />
                  ))}
                  <button type="button" className="add-card" onClick={() => addEffect(teamIndex)}>{t('effect.add')}</button>
                </div>
              </fieldset>
              <RotationEditor draft={scenario.teams[teamIndex]} enemies={scenario.enemies} teamIndex={teamIndex}
                issues={issues} dispatch={dispatch} />
            </section>
          );
        })}
        <section id="results" className="panel results-panel" aria-label={t('results.settings')}>
          <h2>{t('results.settings')}</h2>
          <div className="settings-row">
            <label>
              {t('results.critMode')}
              <select value={scenario.critMode} onChange={({ currentTarget }) => dispatch({
                type: 'setCritMode', critMode: currentTarget.value as CritMode,
              })}>
                {critModes.map((mode) => <option key={mode} value={mode}>{t(`results.critMode.${mode}`)}</option>)}
              </select>
            </label>
            {!showResults && <button type="button" className="primary" onClick={() => setShowResults(true)}>{t('results.calculate')}</button>}
          </div>
          {showResults && <Results scenario={scenario} />}
        </section>
        <DataFooter />
      </main>
    </>
  );
}
