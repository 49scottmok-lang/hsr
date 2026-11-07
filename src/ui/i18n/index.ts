import { zhHK } from './zh-HK';

export type TranslationKey = keyof typeof zhHK;

export function t(key: TranslationKey): string {
  return zhHK[key];
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('zh-HK', options).format(value);
}

export function formatPercent(fraction: number, options?: Intl.NumberFormatOptions): string {
  return formatNumber(fraction, { ...options, style: 'percent' });
}

export function formatDamage(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0, useGrouping: false, signDisplay: 'negative' });
}

export function formatMultiplier(value: number): string {
  return formatNumber(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

const issuePatterns: readonly (readonly [RegExp, TranslationKey])[] = [
  [/^invalid JSON$/, 'issue.invalidJson'],
  [/^invalid structure$/, 'issue.invalidStructure'],
  [/^unreadable file$/, 'issue.unreadableFile'],
  [/^invalid link$/, 'share.invalidLink'],
  [/^unsupported link version$/, 'share.unsupportedVersion'],
  [/^must contain 1 to 4 characters$/, 'issue.teamSize'],
  [/^at least one enemy is required$/, 'issue.enemyRequired'],
  [/^character and enemy IDs must be unique$/, 'issue.uniqueIds'],
  [/^id "(.*)" is reserved$/s, 'issue.reservedUnitId'],
  [/^must be a positive number$/, 'issue.positiveNumber'],
  [/^level must be an integer >= 1$/, 'issue.level'],
  [/^eidolon must be an integer 0–6$/, 'issue.eidolon'],
  [/^requires\.minEidolon must be an integer 0–6$/, 'issue.minEidolon'],
  [/^superimposition must be an integer 1–5$/, 'issue.superimposition'],
  [/^must be a finite number >= 0$/, 'issue.nonNegativeNumber'],
  [/^(?:value )?must be a finite number$/, 'issue.finiteNumber'],
  [/^unknown stat "(.*)"$/s, 'issue.unknownStat'],
  [/^unknown element "(.*)"$/s, 'issue.unknownElement'],
  [/^unknown damage tag "(.*)"$/s, 'issue.unknownTag'],
  [/^effect id is required$/, 'issue.effectIdRequired'],
  [/^maxStacks must be an integer >= 1$/, 'issue.maxStacks'],
  [/^duration\.turns must be an integer >= 1$/, 'issue.duration'],
  [/^duration\.tickUnit "(.*)" is not a unit$/s, 'issue.tickUnit'],
  [/^attacker "(.*)" must be a team member$/s, 'issue.attacker'],
  [/^attacker "(.*)" needs a breakLevelMultiplier for break hits$/s, 'issue.breakLevelMultiplier'],
  [/^target "(.*)" needs a maxToughness for Break DMG$/s, 'issue.maxToughness'],
  [/^toughnessReduction must be a finite number >= 0$/, 'issue.toughnessReduction'],
  [/^breakEfficiency must be a finite number >= 0$/, 'issue.breakEfficiency'],
  [/^fixedToughnessReduction must be a finite number >= 0$/, 'issue.fixedToughnessReduction'],
  [/^target "(.*)" must be an enemy$/s, 'issue.enemyTarget'],
  [/^multiplier must be a finite number >= 0$/, 'issue.multiplier'],
  [/^extraMultiplier must be finite$/, 'issue.extraMultiplier'],
  [/^flatDmg must be finite$/, 'issue.flatDamage'],
  [/^at least one damage tag is required$/, 'issue.tagRequired'],
  [/^duplicate event id "(.*)"$/s, 'issue.duplicateEvent'],
  [/^actor "(.*)" is not a unit$/s, 'issue.actor'],
  [/^target "(.*)" is not a unit$/s, 'issue.unitTarget'],
  [/^source "(.*)" is not a unit$/s, 'issue.source'],
  [/^stacks must be an integer >= 1$/, 'issue.stacks'],
  [/^"(.*)" is not an enemy$/s, 'issue.brokenEnemy'],
];

export function translateIssue(issue: string): string {
  const separator = issue.indexOf(': ');
  const path = separator < 0 ? '' : issue.slice(0, separator);
  const message = separator < 0 ? issue : issue.slice(separator + 2);
  for (const [pattern, key] of issuePatterns) {
    const match = pattern.exec(message);
    if (match) {
      const translated = t(key).replace('{value}', () => match[1] ?? '');
      return path && path !== 'Scenario' ? `${path}：${translated}` : translated;
    }
  }
  return issue;
}
