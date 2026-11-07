/**
 * PLACEHOLDER UI — owned by the frontend agent (see docs/ARCHITECTURE.md §Module ownership).
 * Only proves that the UI can consume the engine's public API. Replace freely.
 */
import { formulas } from '../engine/index';
import { formatNumber, t } from './i18n';

export default function App() {
  const defMult = formulas.defMultiplier(formulas.enemyBaseDef(90), 80);
  return (
    <>
      <title>{t('app.title')}</title>
      <main>
        <h1>{t('app.title')}</h1>
        <p>{t('app.status')}</p>
        <p>
          {t('app.defCheck')}<code>{formatNumber(defMult, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</code>
        </p>
      </main>
    </>
  );
}
