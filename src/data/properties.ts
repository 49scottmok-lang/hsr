/**
 * Game property name → engine stat, used by the D3 generator and by the
 * cross-check tests. The names are checked against two independent readers
 * of the same game data (docs/DATA_SOURCES.md):
 * - Reliquary Archiver `src/export/fribbels/utils.rs` (`main_stat_to_export`,
 *   `sub_stat_to_export`) at 5e50dcb, for the relic main/sub stat names.
 * - Fribbels `game_data.json` trace stat names at dd0c4af, in
 *   `__tests__/crosscheck-b.test.ts`.
 */
import type { Element } from '../engine';
import type { StatTarget } from './schema';

const elemental = (element: Element): StatTarget => ({ stat: 'dmgBoost', condition: { elements: [element] } });

/** `null` = a real game stat that the engine does not model (reported, never dropped silently). */
export const GAME_PROPERTY_TARGETS: Readonly<Record<string, StatTarget | null>> = {
  HPDelta: { stat: 'hpFlat' },
  AttackDelta: { stat: 'atkFlat' },
  DefenceDelta: { stat: 'defFlat' },
  HPAddedRatio: { stat: 'hpPct' },
  AttackAddedRatio: { stat: 'atkPct' },
  DefenceAddedRatio: { stat: 'defPct' },
  SpeedDelta: { stat: 'spdFlat' },
  SpeedAddedRatio: { stat: 'spdPct' },
  CriticalChanceBase: { stat: 'critRate' },
  CriticalDamageBase: { stat: 'critDmg' },
  StatusProbabilityBase: { stat: 'effectHitRate' },
  StatusResistanceBase: { stat: 'effectRes' },
  BreakDamageAddedRatioBase: { stat: 'breakEffect' },
  SPRatioBase: { stat: 'energyRegenRate' },
  PhysicalAddedRatio: elemental('physical'),
  FireAddedRatio: elemental('fire'),
  IceAddedRatio: elemental('ice'),
  ThunderAddedRatio: elemental('lightning'),
  WindAddedRatio: elemental('wind'),
  QuantumAddedRatio: elemental('quantum'),
  ImaginaryAddedRatio: elemental('imaginary'),
  HealRatioBase: null,
  ElationDamageAddedRatioBase: null,
};

/** Relic main stat property → the export's `mainstat` text (Archiver `main_stat_to_export`). */
export const MAIN_STAT_EXPORT_NAMES: Readonly<Record<string, string>> = {
  HPDelta: 'HP',
  AttackDelta: 'ATK',
  HPAddedRatio: 'HP',
  AttackAddedRatio: 'ATK',
  DefenceAddedRatio: 'DEF',
  CriticalChanceBase: 'CRIT Rate',
  CriticalDamageBase: 'CRIT DMG',
  HealRatioBase: 'Outgoing Healing Boost',
  SpeedDelta: 'SPD',
  StatusProbabilityBase: 'Effect Hit Rate',
  PhysicalAddedRatio: 'Physical DMG Boost',
  FireAddedRatio: 'Fire DMG Boost',
  IceAddedRatio: 'Ice DMG Boost',
  ThunderAddedRatio: 'Lightning DMG Boost',
  WindAddedRatio: 'Wind DMG Boost',
  QuantumAddedRatio: 'Quantum DMG Boost',
  ImaginaryAddedRatio: 'Imaginary DMG Boost',
  BreakDamageAddedRatioBase: 'Break Effect',
  SPRatioBase: 'Energy Regeneration Rate',
};

/** Source `DamageType` → engine element. The game calls Lightning "Thunder". */
export const DAMAGE_TYPE_ELEMENTS: Readonly<Record<string, Element>> = {
  Physical: 'physical',
  Fire: 'fire',
  Ice: 'ice',
  Thunder: 'lightning',
  Wind: 'wind',
  Quantum: 'quantum',
  Imaginary: 'imaginary',
};

/** Flat stats are absolute values; every other stat is a fraction. */
export function isFlatStat(stat: string): boolean {
  return stat.endsWith('Flat');
}
