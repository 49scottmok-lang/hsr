import {
  compareTeams, DAMAGE_TAGS, EngineValidationError, runRotation,
  type RotationInput, type RotationResult, type TeamComparison,
} from '../../engine/index';
import { formatDamage, formatMultiplier, formatNumber, t, translateIssue } from '../i18n';
import { toRotationInput, type Scenario } from '../state/scenario';
import { HitResults } from './HitResults';

// Unit references in the current engine share a namespace with group tokens
// and the plain object backing combat state.
const reservedUnitIds = new Set(['allAllies', 'allEnemies', '__proto__']);

function runTeam(input: RotationInput) {
  const reserved = [...input.team, ...input.enemies].filter(({ id }) => reservedUnitIds.has(id));
  if (reserved.length) {
    return { issues: reserved.map(({ id }) => t('results.reservedUnitId').replace('{id}', () => id)) };
  }
  try {
    return { result: runRotation(input) };
  } catch (error) {
    if (error instanceof EngineValidationError) return { issues: error.issues };
    throw error;
  }
}

function damage(value: number | undefined) {
  return value === undefined ? t('results.none') : formatDamage(value);
}

function ratio(value: number | undefined) {
  return value === undefined ? t('results.none') : formatMultiplier(value);
}

function ComparisonTable({ comparison }: { comparison: TeamComparison }) {
  const { a, b } = comparison;
  return (
    <table>
      <caption>{t('results.comparison')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('results.metric')}</th>
          <th scope="col">{a.label}</th>
          <th scope="col">{b.label}</th>
          <th scope="col">{t('results.difference')}</th>
          <th scope="col">{t('results.ratio')}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">{t('results.total')}</th>
          <td>{damage(a.totalDamage)}</td>
          <td>{damage(b.totalDamage)}</td>
          <td>{damage(comparison.totalDifference)}</td>
          <td>{ratio(comparison.totalRatio)}</td>
        </tr>
        <tr>
          <th scope="row">{t('results.perCycle')}</th>
          <td>{damage(a.damagePerCycle)}</td>
          <td>{damage(b.damagePerCycle)}</td>
          <td>{damage(comparison.perCycleDifference)}</td>
          <td>{ratio(comparison.perCycleRatio)}</td>
        </tr>
      </tbody>
    </table>
  );
}

interface TeamResultDetailsProps {
  result: RotationResult;
  input: RotationInput;
}

function TeamResultDetails({ result, input }: TeamResultDetailsProps) {
  const names = new Map([...input.team, ...input.enemies].map(({ id, name }) => [id, name]));
  const unitName = (id: string) => names.get(id) || id;

  return (
    <>
      <table>
        <caption>{t('results.byAttacker')}</caption>
        <thead><tr><th scope="col">{t('results.attacker')}</th><th scope="col">{t('results.damage')}</th></tr></thead>
        <tbody>
          {Object.entries(result.damageByAttacker).map(([id, value]) => (
            <tr key={id}><th scope="row">{unitName(id)}</th><td>{formatDamage(value)}</td></tr>
          ))}
        </tbody>
      </table>
      <table>
        <caption>{t('results.byTag')}</caption>
        <thead><tr><th scope="col">{t('modifier.tags')}</th><th scope="col">{t('results.damage')}</th></tr></thead>
        <tbody>
          {DAMAGE_TAGS.map((tag) => {
            const value = result.damageByTag[tag];
            return value === undefined ? null : (
              <tr key={tag}><th scope="row">{t(`tag.${tag}`)}</th><td>{formatDamage(value)}</td></tr>
            );
          })}
        </tbody>
      </table>
      <p>{t('results.multiTagNote')}</p>
      <HitResults hits={result.hits} unitName={unitName} />
      <table>
        <caption>{t('results.eventLog')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('results.eventId')}</th>
            <th scope="col">{t('rotation.eventLabel')}</th>
            <th scope="col">{t('rotation.eventKind')}</th>
            <th scope="col">{t('rotation.actor')}</th>
            <th scope="col">{t('results.damage')}</th>
            <th scope="col">{t('results.expired')}</th>
            <th scope="col">{t('results.skipped')}</th>
          </tr>
        </thead>
        <tbody>
          {result.log.map((entry) => (
            <tr key={entry.eventId}>
              <th scope="row">{entry.eventId}</th>
              <td>{entry.label || t('results.none')}</td>
              <td>{t(`rotation.${entry.kind}`)}</td>
              <td>{unitName(entry.actorId)}</td>
              <td>{formatDamage(entry.damage)}</td>
              <td>{entry.expired.length ? entry.expired.join(t('results.separator')) : t('results.none')}</td>
              <td>{entry.skippedSteps.length ? (
                <ul>
                  {entry.skippedSteps.map((index) => (
                    <li key={index}>{t('results.skippedReason').replace('{number}', formatNumber(index + 1))}</li>
                  ))}
                </ul>
              ) : t('results.none')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Results({ scenario }: { scenario: Scenario }) {
  const inputs = [toRotationInput(scenario, 0), toRotationInput(scenario, 1)] as const;
  const a = runTeam(inputs[0]);
  const b = runTeam(inputs[1]);
  const outcomes = [a, b] as const;
  const comparison = a.result && b.result ? compareTeams(a.result, b.result, {
    a: scenario.teams[0].label, b: scenario.teams[1].label,
  }) : undefined;

  return (
    <section aria-label={t('results.title')}>
      <h2>{t('results.title')}</h2>
      {comparison && <ComparisonTable comparison={comparison} />}
      {([0, 1] as const).map((index) => {
        const { result, issues } = outcomes[index];
        const heading = t('results.teamDetails').replace('{team}', () => scenario.teams[index].label);
        return (
          <section key={index} aria-label={heading}>
            <h3>{heading}</h3>
            {issues && (
              <div role="alert">
                <p>{t('results.invalid')}</p>
                <ul>{issues.map((issue, i) => <li key={i}>{translateIssue(issue)}</li>)}</ul>
              </div>
            )}
            {result && (
              <>
                {!comparison && (
                  <dl>
                    <dt>{t('results.total')}</dt><dd>{damage(result.totalDamage)}</dd>
                    <dt>{t('results.perCycle')}</dt><dd>{damage(result.damagePerCycle)}</dd>
                  </dl>
                )}
                <TeamResultDetails result={result} input={inputs[index]} />
              </>
            )}
          </section>
        );
      })}
    </section>
  );
}
