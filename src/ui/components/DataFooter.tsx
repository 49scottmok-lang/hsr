import formulasUrl from '../../../docs/FORMULAS.md?url&no-inline';
import { DATA_CREDITS } from '../../data';
import { t } from '../i18n';

export function DataFooter() {
  return (
    <footer>
      <p>{t('credits.dataNotice')} <a href="#data-credits">{t('credits.title')}</a></p>
      <p>{t('credits.formulaNotice')} <a href={formulasUrl}>{t('credits.formulas')}</a></p>
      <p>{t('credits.gameNotice')}</p>
      <section aria-labelledby="data-credits">
        <h2 id="data-credits">{t('credits.title')}</h2>
        <ul>
          {DATA_CREDITS.map((credit) => (
            <li key={credit.repo}>
              <a href={credit.url}>{credit.name}</a>
              {t('credits.details')
                .replace('{role}', t(`credits.role.${credit.role}`))
                .replace('{licence}', credit.licence ?? t('credits.licenceUnknown'))
                .replace('{commit}', credit.commit.slice(0, 7))}
            </li>
          ))}
        </ul>
      </section>
    </footer>
  );
}
