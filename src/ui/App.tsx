/**
 * PLACEHOLDER UI — owned by the frontend agent (see docs/ARCHITECTURE.md §Module ownership).
 * Only proves that the UI can consume the engine's public API. Replace freely.
 */
import { formulas } from '../engine';

export default function App() {
  const defMult = formulas.defMultiplier(formulas.enemyBaseDef(90), 80);
  return (
    <main>
      <h1>HSR Team Damage Comparator</h1>
      <p>Calculation engine is ready. The UI has not been implemented yet.</p>
      <p>
        Engine smoke check — DEF multiplier, Lv80 attacker vs Lv90 enemy: <code>{defMult.toFixed(4)}</code>
      </p>
    </main>
  );
}
