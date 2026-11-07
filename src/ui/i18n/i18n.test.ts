// @vitest-environment node
import { expect, expectTypeOf, it } from 'vitest';
import { formatNumber, formatPercent, t, translateIssue, type TranslationKey } from './index';

it('looks up zh-HK text with typed keys', () => {
  expect(t('app.title')).toBe('星穹鐵道隊伍傷害比較器');
  expect(t('term.lightCone')).toBe('光錐');
  expectTypeOf<'app.missing'>().not.toExtend<TranslationKey>();
});

it('formats numbers and fractional percentages for zh-HK', () => {
  expect(formatNumber(1234.5, { minimumFractionDigits: 2 })).toBe('1,234.50');
  expect(formatPercent(0.5)).toBe('50%');
  expect(formatPercent(0.125, { maximumFractionDigits: 1 })).toBe('12.5%');
});

it.each([
  ['teams[1].events[0].steps[2]: target "boss" must be an enemy', 'teams[1].events[0].steps[2]：目標「boss」須為敵人。'],
  ['events[0]: actor "ally" is not a unit', 'events[0]：行動者「ally」並非有效單位。'],
  ['events[0].steps[2]: target "ally" is not a unit', 'events[0].steps[2]：目標「ally」並非有效單位。'],
  ['events[0].steps[2]: at least one damage tag is required', 'events[0].steps[2]：至少需要一個傷害標籤。'],
  ['Scenario: invalid JSON', '情境檔案的 JSON 格式無效。'],
  ['events[0]: unknown future issue', 'events[0]: unknown future issue'],
])('translates %s or preserves the original issue', (issue, expected) => {
  expect(translateIssue(issue)).toBe(expected);
});
