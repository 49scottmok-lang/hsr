import { useReducer, useRef, useState } from 'react';
import type { CritMode } from '../engine/index';
import { CharacterEditor } from './components/CharacterEditor';
import { EffectEditor } from './components/EffectEditor';
import { EnemyEditor } from './components/EnemyEditor';
import { IssueList } from './components/IssueList';
import { Results } from './components/Results';
import { RotationEditor } from './components/RotationEditor';
import { t } from './i18n';
import { suggestedBreakLevelMultiplier } from './state/break-level';
import { scenarioReducer } from './state/reducer';
import { editorIssues, scenarioIssues } from './state/scenario-issues';
import { importScenario, type ScenarioImportResult } from './state/scenario-json';
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
  const [scenario, dispatch] = useReducer(scenarioReducer, initialScenario);
  const [showResults, setShowResults] = useState(false);
  const [loaded, setLoaded] = useState<ScenarioImportResult>();
  const issues = editorIssues(scenario, loaded?.ok && loaded.scenario === scenario
    ? loaded.issues
    : showResults || loaded?.ok ? scenarioIssues(scenario) : []);
  const fileRead = useRef(0);
  const nextCharacterNumber = useRef(1);
  const nextEnemyNumber = useRef(1);

  function loadScenario(result: ScenarioImportResult) {
    setLoaded(result);
    if (result.ok) dispatch({ type: 'replaceScenario', scenario: result.scenario });
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

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <label>
        {t('scenario.import')}
        <input type="file" accept=".json,application/json" onChange={({ currentTarget }) => {
          const file = currentTarget.files?.[0];
          currentTarget.value = '';
          if (file) void readScenarioFile(file);
        }} />
      </label>
      {loaded && !loaded.ok && <div role="alert"><IssueList issues={loaded.issues} /></div>}
      <section aria-label={t('enemy.shared')}>
        <h2>{t('enemy.shared')}</h2>
        <IssueList issues={issues.get('enemies')} />
        {scenario.enemies.map((enemy, index) => (
          <EnemyEditor
            key={index}
            enemy={enemy}
            issues={issues.get(`enemies[${index}]`)}
            onChange={(value) => dispatch({ type: 'editEnemies', edit: { type: 'update', index, value } })}
            onRemove={() => dispatch({ type: 'editEnemies', edit: { type: 'remove', index } })}
          />
        ))}
        <button type="button" onClick={addEnemy}>{t('enemy.add')}</button>
      </section>
      {([0, 1] as const).map((teamIndex) => {
        const { label, team, effectLibrary = [] } = scenario.teams[teamIndex];
        return (
          <section key={teamIndex} aria-label={label}>
            <h2>{label}</h2>
            <IssueList issues={issues.get(`teams[${teamIndex}]`)} />
            {team.map((build, index) => (
              <CharacterEditor
                key={index}
                build={build}
                issues={issues.get(`teams[${teamIndex}].team[${index}]`)}
                onChange={(value) => dispatch({ type: 'editCharacters', teamIndex, edit: { type: 'update', index, value } })}
                onRemove={() => dispatch({ type: 'editCharacters', teamIndex, edit: { type: 'remove', index } })}
              />
            ))}
            <button
              type="button"
              disabled={team.length >= 4}
              onClick={() => addCharacter(teamIndex)}
            >
              {t('character.add')}
            </button>
            <fieldset>
              <legend>{t('effect.library')}</legend>
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
              <button type="button" onClick={() => addEffect(teamIndex)}>{t('effect.add')}</button>
            </fieldset>
            <RotationEditor draft={scenario.teams[teamIndex]} enemies={scenario.enemies} teamIndex={teamIndex}
              issues={issues} dispatch={dispatch} />
          </section>
        );
      })}
      <label>
        {t('results.critMode')}
        <select value={scenario.critMode} onChange={({ currentTarget }) => dispatch({
          type: 'setCritMode', critMode: currentTarget.value as CritMode,
        })}>
          {critModes.map((mode) => <option key={mode} value={mode}>{t(`results.critMode.${mode}`)}</option>)}
        </select>
      </label>
      {!showResults && <button type="button" onClick={() => setShowResults(true)}>{t('results.calculate')}</button>}
      {showResults && <Results scenario={scenario} />}
    </main>
  );
}
