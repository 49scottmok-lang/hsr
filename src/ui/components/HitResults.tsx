import type { DamageBreakdown, HitResult, ResolvedHitStats } from '../../engine/index';
import { formatDamage, formatMultiplier, formatNumber, formatPercent, t, type TranslationKey } from '../i18n';

const multiplierLabels = {
  critMultiplier: 'results.critMultiplier',
  dmgBoostMultiplier: 'results.dmgBoostMultiplier',
  weakenMultiplier: 'results.weakenMultiplier',
  defMultiplier: 'results.defMultiplier',
  resMultiplier: 'results.resMultiplier',
  vulnerabilityMultiplier: 'results.vulnerabilityMultiplier',
  mitigationMultiplier: 'results.mitigationMultiplier',
  brokenMultiplier: 'results.brokenMultiplier',
  finalDmgMultiplier: 'results.finalDmgMultiplier',
  trueDmgMultiplier: 'results.trueDmgMultiplier',
} satisfies Record<Exclude<keyof DamageBreakdown, 'baseDmg' | 'total'>, TranslationKey>;
const multipliers = Object.keys(multiplierLabels) as (keyof typeof multiplierLabels)[];

const resolvedLabels = {
  scalingValue: 'results.scalingValue',
  critRate: 'stat.critRate',
  critDmg: 'stat.critDmg',
  dmgBoost: 'stat.dmgBoost',
  weaken: 'stat.weaken',
  finalDmgBoosts: 'stat.finalDmgBoost',
  trueDmg: 'stat.trueDmg',
  defIgnore: 'stat.defIgnore',
  resPen: 'stat.resPen',
  targetBaseDef: 'results.targetBaseDef',
  targetDefPct: 'stat.defPct',
  targetDefFlat: 'stat.defFlat',
  targetDefReduction: 'stat.defReduction',
  targetBaseRes: 'results.targetBaseRes',
  targetResReduction: 'stat.resReduction',
  vulnerability: 'stat.vulnerability',
  mitigations: 'stat.dmgMitigation',
  attackerLevel: 'results.attackerLevel',
  targetBroken: 'results.targetBroken',
} satisfies Record<keyof ResolvedHitStats, TranslationKey>;
const resolvedKeys = Object.keys(resolvedLabels) as (keyof ResolvedHitStats)[];
const absoluteStats: ReadonlySet<keyof ResolvedHitStats> = new Set([
  'scalingValue', 'targetBaseDef', 'targetDefFlat', 'attackerLevel',
]);

function formatResolved(stats: ResolvedHitStats, key: keyof ResolvedHitStats): string {
  const value = stats[key];
  const percent = (fraction: number) => formatPercent(fraction, { maximumFractionDigits: 4 });
  if (typeof value === 'boolean') return t(value ? 'results.yes' : 'results.no');
  if (typeof value !== 'number') return value.length ? value.map(percent).join(t('results.separator')) : t('results.none');
  return absoluteStats.has(key) ? formatNumber(value, { maximumFractionDigits: 4 }) : percent(value);
}

interface HitResultsProps {
  hits: readonly HitResult[];
  unitName: (id: string) => string;
}

export function HitResults({ hits, unitName }: HitResultsProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <caption>{t('results.hits')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('results.eventId')}</th>
            <th scope="col">{t('rotation.hitLabel')}</th>
            <th scope="col">{t('results.attacker')}</th>
            <th scope="col">{t('rotation.target')}</th>
            <th scope="col">{t('results.element')}</th>
            <th scope="col">{t('modifier.tags')}</th>
            <th scope="col">{t('results.baseDmg')}</th>
            {multipliers.map((key) => <th key={key} scope="col">{t(multiplierLabels[key])}</th>)}
            <th scope="col">{t('results.damage')}</th>
            <th scope="col">{t('results.details')}</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => (
            <tr key={JSON.stringify([hit.eventId, hit.hitIndex])}>
              <td>{hit.eventId}</td>
              <td>{hit.label || t('results.none')}</td>
              <td>{unitName(hit.attackerId)}</td>
              <td>{unitName(hit.targetId)}</td>
              <td>{t(`element.${hit.element}`)}</td>
              <td>{hit.tags.map((tag) => t(`tag.${tag}`)).join(t('results.separator'))}</td>
              <td>{formatDamage(hit.breakdown.baseDmg)}</td>
              {multipliers.map((key) => <td key={key}>{formatMultiplier(hit.breakdown[key])}</td>)}
              <td>{formatDamage(hit.damage)}</td>
              <td>
                <details>
                  <summary>{t('results.resolvedStats')}</summary>
                  <dl>
                    {resolvedKeys.map((key) => (
                      <div key={key}><dt>{t(resolvedLabels[key])}</dt><dd>{formatResolved(hit.stats, key)}</dd></div>
                    ))}
                  </dl>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
