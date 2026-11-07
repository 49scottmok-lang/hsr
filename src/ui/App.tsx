import { useReducer, useRef } from 'react';
import { CharacterEditor } from './components/CharacterEditor';
import { t } from './i18n';
import { scenarioReducer } from './state/reducer';
import type { Scenario, TeamIndex } from './state/scenario';

const initialScenario: Scenario = {
  critMode: 'expected',
  enemies: [],
  teams: [
    { label: t('team.a'), team: [], events: [] },
    { label: t('team.b'), team: [], events: [] },
  ],
};

export default function App() {
  const [scenario, dispatch] = useReducer(scenarioReducer, initialScenario);
  const nextCharacterNumber = useRef(1);

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
          element: 'physical',
          base: { hp: 0, atk: 0, def: 0, spd: 0 },
        },
      },
    });
  }

  return (
    <main>
      <h1>{t('app.title')}</h1>
      {([0, 1] as const).map((teamIndex) => {
        const { label, team } = scenario.teams[teamIndex];
        return (
          <section key={teamIndex} aria-label={label}>
            <h2>{label}</h2>
            {team.map((build, index) => (
              <CharacterEditor
                key={build.id}
                build={build}
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
          </section>
        );
      })}
    </main>
  );
}
