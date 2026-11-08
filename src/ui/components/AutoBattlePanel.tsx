import { useState } from 'react';
import {
  CHALLENGE_CYCLE_AV, EngineValidationError, simulateBattle,
  type AutoBattleInput, type AutoBattleResult, type CharacterBuild, type EffectDef, type EnemyConfig,
} from '../../engine/index';
import { formatNumber, t, translateIssue } from '../i18n';
import {
  applyKitTemplate, AUTO_KIT_ACTIONS, kitTemplateFor, newKit, toAutoBattleInput, type KitPrefill, type AutoBattleDraft, type AutoKitActionName, type AutoKitDraft,
} from '../state/auto-battle';
import { editList, type ScenarioAction } from '../state/reducer';
import type { TeamDraft, TeamIndex } from '../state/scenario';
import { NumberField } from './NumberField';
import { StepList } from './StepList';
import { UnitSelect } from './UnitSelect';

interface AutoBattlePanelProps {
  draft: TeamDraft;
  enemies: readonly EnemyConfig[];
  teamIndex: TeamIndex;
  dispatch: (action: ScenarioAction) => void;
}

interface Outcome {
  key: string;
  result?: AutoBattleResult;
  issues?: readonly string[];
  replaced?: number;
}

const emptySettings: AutoBattleDraft = { kits: [] };

/**
 * Auto battle (D7): the user enters each member's kit once and the engine
 * plays it over the SPD turn order. The generated rotation replaces the
 * manual one and stays editable.
 */
export function AutoBattlePanel({ draft, enemies, teamIndex, dispatch }: AutoBattlePanelProps) {
  const { team, effectLibrary = [] } = draft;
  const settings = draft.autoBattle ?? emptySettings;
  const [outcome, setOutcome] = useState<Outcome>();
  const names = new Map([...team, ...enemies].map(({ id, name }) => [id, name || id]));
  // Only this team's fields are read, so the other slot can repeat it.
  const input = toAutoBattleInput({ enemies, critMode: 'expected', teams: [draft, draft] }, 0);
  // A result is shown only while the settings that produced it are unchanged.
  const key = JSON.stringify(input);
  const current = outcome?.key === key ? outcome : undefined;
  const showCycle = input.cycleAv !== undefined;

  const update = (patch: Partial<AutoBattleDraft>) =>
    dispatch({ type: 'setAutoBattle', teamIndex, autoBattle: { ...settings, ...patch } });
  const updateKit = (unitId: string, kit: AutoKitDraft | undefined) => {
    const index = settings.kits.findIndex((other) => other.unitId === unitId);
    const kits = index < 0 ? (kit ? [...settings.kits, kit] : settings.kits)
      : kit ? settings.kits.with(index, kit) : settings.kits.toSpliced(index, 1);
    update({ kits });
  };

  function simulate() {
    try {
      setOutcome({ key, result: simulateBattle(input) });
    } catch (error) {
      if (!(error instanceof EngineValidationError)) throw error;
      setOutcome({ key, issues: error.issues.map((issue) => issueText(issue, input, names)) });
    }
  }

  const result = current?.result;
  return (
    <details className="auto-battle">
      <summary>{t('auto.title')}</summary>
      <p>{t('auto.hint')}</p>
      <div className="turn-order-fields">
        <NumberField label={t('auto.avLimit')} value={settings.avLimit} onChange={(avLimit) => update({ avLimit })} />
        <NumberField label={t('auto.skillPointStart')} value={settings.skillPointStart} min={0} integer
          onChange={(skillPointStart) => update({ skillPointStart })} />
        <NumberField label={t('auto.skillPointMax')} value={settings.skillPointMax} min={1} integer
          onChange={(skillPointMax) => update({ skillPointMax })} />
        <NumberField label={t('auto.firstCycle')} value={settings.firstCycle}
          onChange={(firstCycle) => update({ firstCycle })} />
        <NumberField label={t('auto.laterCycle')} value={settings.laterCycle}
          onChange={(laterCycle) => update({ laterCycle })} />
        <button type="button"
          onClick={() => update({ firstCycle: CHALLENGE_CYCLE_AV.first, laterCycle: CHALLENGE_CYCLE_AV.later })}>
          {t('auto.cyclePreset').replace('{first}', formatNumber(CHALLENGE_CYCLE_AV.first))
            .replace('{later}', formatNumber(CHALLENGE_CYCLE_AV.later))}
        </button>
      </div>
      {team.map((build, index) => {
        const kit = settings.kits.find(({ unitId }) => unitId === build.id);
        return (
          <fieldset key={index}>
            <legend>{t('auto.kitFor').replace('{name}', () => names.get(build.id) ?? build.id)}</legend>
            <label>
              <input type="checkbox" checked={kit !== undefined}
                onChange={({ currentTarget }) => updateKit(build.id, currentTarget.checked ? newKit(build, enemies) : undefined)} />
              {t('auto.enabled')}
            </label>
            {kit && <KitEditor kit={kit} build={build} draft={draft} enemies={enemies} effects={effectLibrary}
              onChange={(value) => updateKit(build.id, value)} />}
          </fieldset>
        );
      })}
      <button type="button" disabled={team.length === 0} onClick={simulate}>{t('auto.simulate')}</button>
      {current?.issues && <div role="alert"><ul>{current.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
      {current?.replaced !== undefined && (
        <p role="status">{t('auto.replaced').replace('{number}', formatNumber(current.replaced))}</p>
      )}
      {result && current?.replaced === undefined && <>
        {result.truncated && <p role="status">{t('timeline.truncated')}</p>}
        {result.actions.length === 0 ? <p role="status">{t('timeline.noTurns')}</p> : <>
          <div className="turn-order-preview" tabIndex={0} role="region" aria-label={t('auto.log')}>
            <table>
              <caption>{t('auto.log')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('timeline.elapsedAv')}</th>
                  {showCycle && <th scope="col">{t('timeline.cycle')}</th>}
                  <th scope="col">{t('rotation.actor')}</th>
                  <th scope="col">{t('auto.actionColumn')}</th>
                  <th scope="col">{t('auto.skillPoints')}</th>
                  <th scope="col">{t('auto.energy')}</th>
                </tr>
              </thead>
              <tbody>{result.actions.map(({ unitId, action, av, cycle, skillPoints, energy }, index) => (
                <tr key={index}>
                  <td>{formatNumber(av, { maximumFractionDigits: 2 })}</td>
                  {showCycle && <td>{cycle === undefined ? '' : formatNumber(cycle)}</td>}
                  <th scope="row">{names.get(unitId) ?? unitId}</th>
                  <td>{t(`auto.log.${action}`)}</td>
                  <td>{formatNumber(skillPoints)}</td>
                  <td>{energy === undefined ? '' : formatNumber(energy, { maximumFractionDigits: 1 })}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <button type="button" onClick={() => {
            dispatch({ type: 'replaceRotation', teamIndex, events: result.events, cycles: result.cycles });
            setOutcome({ key, replaced: result.events.length });
          }}>{t('auto.replace').replace('{number}', formatNumber(result.events.length))}</button>
        </>}
      </>}
    </details>
  );
}

interface KitEditorProps {
  kit: AutoKitDraft;
  build: CharacterBuild;
  draft: TeamDraft;
  enemies: readonly EnemyConfig[];
  effects: readonly EffectDef[];
  onChange: (kit: AutoKitDraft) => void;
}

function KitEditor({ kit, build, draft, enemies, effects, onChange }: KitEditorProps) {
  const update = (patch: Partial<AutoKitDraft>) => onChange({ ...kit, ...patch });
  return (
    <>
      <KitPrefillEditor kit={kit} build={build} enemies={enemies} onChange={onChange} />
      <div className="turn-order-fields">
        <NumberField label={t('auto.startEnergy')} value={kit.startEnergy} min={0}
          onChange={(startEnergy) => update({ startEnergy })} />
        <NumberField label={t('auto.skillPointReserve')} value={kit.skillPointReserve} min={0} integer
          onChange={(skillPointReserve) => update({ skillPointReserve })} />
        <label>
          <input type="checkbox" checked={kit.useSkill}
            onChange={({ currentTarget }) => update({ useSkill: currentTarget.checked })} />
          {t('auto.useSkill')}
        </label>
        <label>
          <input type="checkbox" checked={kit.useUltimate}
            onChange={({ currentTarget }) => update({ useUltimate: currentTarget.checked })} />
          {t('auto.useUltimate')}
        </label>
      </div>
      {AUTO_KIT_ACTIONS.map((name) => {
        const action = kit[name];
        const set = (patch: Partial<AutoKitDraft[typeof name]>) => update({ [name]: { ...action, ...patch } });
        return (
          <fieldset key={name}>
            <legend>{t(`auto.action.${name}`)}</legend>
            <div className="turn-order-fields">
              <NumberField label={t('auto.energyGain')} value={action.energy} min={0} onChange={(energy) => set({ energy })} />
              {name === 'ultimate'
                ? <NumberField label={t('auto.energyCost')} value={kit.ultimate.energyCost} min={0}
                  onChange={(energyCost) => update({ ultimate: { ...kit.ultimate, energyCost } })} />
                : <NumberField label={t(name === 'basic' ? 'auto.skillPointGain' : 'auto.skillPointCost')}
                  value={kit[name].skillPoints} min={0} integer
                  onChange={(skillPoints) => update({ [name]: { ...kit[name], skillPoints } })} />}
            </div>
            <StepList steps={action.steps} team={draft.team} enemies={enemies} effects={effects}
              onEdit={(edit) => set({ steps: editList(action.steps, edit) })} />
          </fieldset>
        );
      })}
    </>
  );
}

interface KitPrefillEditorProps {
  kit: AutoKitDraft;
  build: CharacterBuild;
  enemies: readonly EnemyConfig[];
  onChange: (kit: AutoKitDraft) => void;
}

/** Skill levels and target for the sourced kit template, what it can fill, and what stays manual. */
function KitPrefillEditor({ kit, build, enemies, onChange }: KitPrefillEditorProps) {
  const prefill = kit.prefill ?? {};
  const template = kitTemplateFor(build, enemies, prefill);
  // Without a game character ID there is no table row to fill from.
  if (!template) return null;
  const set = (patch: KitPrefill) => onChange({ ...kit, prefill: { ...prefill, ...patch } });
  const actionName = (name: AutoKitActionName) => t(`auto.action.${name}`);
  const lines: string[] = [];
  if (template.ok) {
    for (const name of AUTO_KIT_ACTIONS) {
      const action = template.value.actions[name];
      if (!action) continue;
      const notes = [
        ...(action.steps.length === 0 ? [t('auto.prefill.noDamage')] : []),
        ...(action.otherEffects ? [t('auto.prefill.otherEffects')] : []),
      ];
      lines.push(t('auto.prefill.ready').replace('{action}', () => actionName(name)).replace('{name}', () => action.name)
        .replace('{level}', formatNumber(action.level)) + notes.map((note) => `${t('results.separator')}${note}`).join(''));
    }
    for (const gap of template.value.gaps) {
      lines.push(t(`auto.prefill.gap.${gap.reason}`).replace('{action}', () => actionName(gap.slot)));
    }
  }
  const canApply = template.ok && Object.keys(template.value.actions).length > 0;
  return (
    <fieldset>
      <legend>{t('auto.prefill.title')}</legend>
      <p>{t('auto.prefill.hint')}</p>
      <div className="turn-order-fields">
        {AUTO_KIT_ACTIONS.map((name) => (
          <NumberField key={name} label={t(`auto.prefill.level.${name}`)} value={prefill[name]} min={1} integer
            onChange={(level) => set({ [name]: level })} />
        ))}
        <UnitSelect label={t('auto.prefill.target')} value={prefill.targetId ?? ''} units={enemies}
          emptyLabel={t('auto.prefill.firstEnemy')} onChange={(targetId) => set({ targetId: targetId || undefined })} />
      </div>
      {template.ok
        ? <ul>{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
        : <p role="status">{t(enemies.length === 0 ? 'auto.prefill.noEnemies' : 'auto.prefill.noKit')}</p>}
      <button type="button" disabled={!canApply}
        onClick={() => { if (template.ok) onChange(applyKitTemplate(kit, template.value)); }}>
        {t('auto.prefill.apply')}
      </button>
      {template.ok && <p>{t('auto.prefill.source').replace('{version}', () => template.value.gameVersion)}</p>}
    </fieldset>
  );
}

const actionNames = new Set<string>(AUTO_KIT_ACTIONS);

/** Names the field an engine issue is about, then translates the message. */
function issueText(issue: string, input: AutoBattleInput, names: ReadonlyMap<string, string>): string {
  const separator = issue.indexOf(': ');
  const path = separator < 0 ? '' : issue.slice(0, separator);
  const message = translateIssue(separator < 0 ? issue : issue.slice(separator + 2));
  const kit = /^kits\[(\d+)\](?:\.(\w+))?(?:\.steps\[(\d+)\])?/.exec(path);
  const enemy = /^enemies\[(\d+)\]/.exec(path);
  let label: string;
  if (kit) {
    const unitId = input.kits[Number(kit[1])]?.unitId ?? '';
    const parts = [names.get(unitId) ?? unitId];
    const field = kit[2];
    if (field && actionNames.has(field)) parts.push(t(`auto.action.${field as AutoKitActionName}`));
    else if (field === 'startEnergy') parts.push(t('auto.startEnergy'));
    else if (field === 'skillPointReserve') parts.push(t('auto.skillPointReserve'));
    if (kit[3] !== undefined) parts.push(t('auto.stepNumber').replace('{number}', formatNumber(Number(kit[3]) + 1)));
    else if (path.endsWith('.energy')) parts.push(t('auto.energyGain'));
    else if (path.endsWith('.energyCost')) parts.push(t('auto.energyCost'));
    else if (path.endsWith('.basic.skillPoints')) parts.push(t('auto.skillPointGain'));
    else if (path.endsWith('.skillPoints')) parts.push(t('auto.skillPointCost'));
    label = parts.join('・');
  } else if (enemy) {
    const unitId = input.enemies[Number(enemy[1])]?.id ?? '';
    label = `${names.get(unitId) ?? unitId}・${t('enemy.spd')}`;
  } else {
    label = path === 'avLimit' ? t('auto.avLimit')
      : path === 'skillPoints.start' ? t('auto.skillPointStart')
      : path === 'skillPoints.max' ? t('auto.skillPointMax')
      : path === 'cycleAv.first' ? t('auto.firstCycle')
      : path === 'cycleAv.later' ? t('auto.laterCycle')
      : t('auto.title');
  }
  return `${label}：${message}`;
}
