import type { CharacterBuild } from '../../engine/index';
import { characterArt, elementArt, pathArt } from '../assets/game-art';
import { formatNumber, t } from '../i18n';
import { buildCharacterId, characterPathId } from '../state/characters';
import { GameImage } from './GameImage';

interface PortraitCardProps {
  build: CharacterBuild;
  selected: boolean;
  hasIssues: boolean;
  onSelect: () => void;
}

export function PortraitCard({ build, selected, hasIssues, onSelect }: PortraitCardProps) {
  const characterId = buildCharacterId(build);
  const pathId = characterId && characterPathId(characterId);
  const name = build.name || t('character.title');
  return (
    <button type="button" className="portrait" data-element={build.element} aria-pressed={selected} onClick={onSelect}>
      <span className="portrait-art">
        <GameImage
          srcs={characterId ? characterArt(characterId, 'preview') : []}
          fallback={<span className="portrait-initial" aria-hidden="true">{Array.from(name)[0]}</span>}
        />
      </span>
      <span className="portrait-badges" aria-hidden="true">
        <GameImage className="badge-icon" srcs={elementArt(build.element)} />
        {pathId && <GameImage className="badge-icon" srcs={pathArt(pathId)} />}
      </span>
      {hasIssues && <span className="portrait-issue" role="img" aria-label={t('character.hasIssues')} />}
      <span className="portrait-info">
        <span className="portrait-name">{name}</span>
        <span className="portrait-meta">
          <span>{t('character.levelShort').replace('{level}', formatNumber(build.level))}</span>
          <span>{t('character.eidolonRank').replace('{rank}', formatNumber(build.eidolon ?? 0))}</span>
        </span>
        {build.lightCone?.name && <span className="portrait-cone">{build.lightCone.name}</span>}
      </span>
    </button>
  );
}
