import { ARTWORK_COMMIT as ART_COMMIT, ARTWORK_REPO as ART_REPO } from '../../data';
import type { Element } from '../../engine/index';

/**
 * Character, element and path artwork, hotlinked (never copied into this
 * repository) from Mar-7th/StarRailRes at a pinned commit. The images are
 * HoYoverse's; see docs/DATA_SOURCES.md § Artwork.
 *
 * jsDelivr comes first for its CDN caching; GitHub raw is the fallback.
 */
// (Order matters: GameImage tries each URL in turn.) first for its CDN caching; GitHub raw as a fallback when it fails.
const HOSTS = [
  `https://cdn.jsdelivr.net/gh/${ART_REPO}@${ART_COMMIT}/`,
  `https://raw.githubusercontent.com/${ART_REPO}/${ART_COMMIT}/`,
] as const;

const urls = (path: string): readonly string[] => HOSTS.map((host) => host + path);

// StarRailRes `index_new/en/elements.json` IDs; the game calls Lightning "Thunder".
const ELEMENT_FILES: Readonly<Record<Element, string>> = {
  physical: 'Physical',
  fire: 'Fire',
  ice: 'Ice',
  lightning: 'Thunder',
  wind: 'Wind',
  quantum: 'Quantum',
  imaginary: 'Imaginary',
};

// StarRailRes `index_new/en/paths.json`: source path ID → icon file name.
const PATH_FILES: Readonly<Record<string, string>> = {
  Warrior: 'Destruction',
  Rogue: 'Hunt',
  Mage: 'Erudition',
  Shaman: 'Harmony',
  Warlock: 'Nihility',
  Knight: 'Preservation',
  Priest: 'Abundance',
  Memory: 'Remembrance',
  Elation: 'Elation',
};

/** `preview` is the tall card art (376×512); `icon` is the round avatar. */
export function characterArt(characterId: string, kind: 'preview' | 'icon'): readonly string[] {
  if (!/^\d+$/.test(characterId)) return [];
  return urls(kind === 'icon' ? `icon/character/${characterId}.png` : `image/character_preview/${characterId}.png`);
}

export function elementArt(element: Element): readonly string[] {
  return urls(`icon/element/${ELEMENT_FILES[element]}.png`);
}

export function pathArt(pathId: string): readonly string[] {
  const file = PATH_FILES[pathId];
  return file ? urls(`icon/path/${file}.png`) : [];
}
