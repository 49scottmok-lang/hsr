import { useState } from 'react';
import { t, type TranslationKey } from '../i18n';
import type { Scenario } from '../state/scenario';
import { encodeScenarioLink } from './scenario-link';

export function ShareButton({ scenario }: { scenario: Scenario }) {
  const [outcome, setOutcome] = useState<{ scenario: Scenario; status: TranslationKey; link?: string }>();
  const visible = outcome?.scenario === scenario ? outcome : undefined;

  async function copy() {
    let link: string;
    try {
      const url = new URL(window.location.href);
      url.hash = await encodeScenarioLink(scenario);
      link = url.href;
    } catch {
      setOutcome({ scenario, status: 'share.encodeFailed' });
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setOutcome({ scenario, status: 'share.copied' });
    } catch {
      setOutcome({ scenario, status: 'share.copyFailed', link });
    }
  }

  return (
    <>
      <button type="button" onClick={() => void copy()}>{t('share.copy')}</button>
      {visible && <p role="status">{t(visible.status)}</p>}
      {visible?.link && <input type="url" readOnly value={visible.link} aria-label={t('share.link')}
        onFocus={({ currentTarget }) => currentTarget.select()} />}
    </>
  );
}
