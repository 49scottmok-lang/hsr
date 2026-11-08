import type { BreakDetails, DamageBreakdown, HitResult, ResolvedHitStats } from '../../engine/index';
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
  dotChanceMultiplier: 'results.dotChanceMultiplier',
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
  effectHitRate: 'stat.effectHitRate',
  effectResPen: 'stat.effectResPen',
  targetEffectRes: 'results.targetEffectRes',
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

function BreakResult({ details }: { details: BreakDetails }) {
  const factors = [
    ['character.breakLevelMultiplier', details.levelMultiplier],
    ['results.elementFactor', details.elementFactor],
    ['enemy.maxToughness', details.maxToughness],
    ['results.effectiveToughness', details.toughness],
    ['results.hitMultiplier', details.multiplier],
    ['results.breakEffectMultiplier', details.breakEffectMultiplier],
  ] as const;
  const bonuses = [
    ['stat.breakEfficiency', details.breakEfficiency],
    ['stat.breakEffect', details.breakEffect],
    ['results.breakDmgIncrease', details.breakDmgIncrease],
    ['results.superBreakDmgIncrease', details.superBreakDmgIncrease],
  ] as const;
  return (
    <details>
      <summary>{t(`rotation.breakKind.${details.kind}`)}</summary>
      <p>{t('results.breakBaseNote')}</p>
      {details.kind === 'superBreak' && <p>{t('results.superBreakBoostNote')}</p>}
      <dl>
        {factors.map(([label, value]) => value === undefined ? null : (
          <div key={label}><dt>{t(label)}</dt><dd>{formatMultiplier(value)}</dd></div>
        ))}
        {bonuses.map(([label, value]) => value === undefined ? null : (
          <div key={label}><dt>{t(label)}</dt><dd>{formatPercent(value, { maximumFractionDigits: 4 })}</dd></div>
        ))}
      </dl>
    </details>
  );
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
              <td>{hit.tags.map((tag) => t(`tag.${tag}`)).join(t('results.separator')) || t('results.none')}</td>
              <td>{formatDamage(hit.breakdown.baseDmg)}</td>
              {multipliers.map((key) => <td key={key}>{formatMultiplier(hit.breakdown[key])}</td>)}
              <td>{formatDamage(hit.damage)}</td>
              <td>
                {hit.break && <BreakResult details={hit.break} />}
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
