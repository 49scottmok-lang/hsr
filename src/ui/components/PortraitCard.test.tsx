// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ARTWORK_COMMIT, DATA_TABLES } from '../../data';
import type { CharacterBuild } from '../../engine/index';
import { t } from '../i18n';
import { GameImage } from './GameImage';
import { PortraitCard } from './PortraitCard';

afterEach(cleanup);

// TEST FIXTURE — NOT GAME DATA
const build: CharacterBuild = {
  id: 'character-1',
  name: 'Test character',
  level: 3,
  element: 'ice',
  eidolon: 1,
  base: { hp: 1, atk: 1, def: 1, spd: 1 },
};

it('tries each image URL in turn, then shows the fallback', () => {
  const { container } = render(<GameImage srcs={['https://a.test/1.png', 'https://b.test/1.png']} fallback={<span>fallback</span>} />);
  const image = () => container.querySelector('img');
  expect(image()?.getAttribute('src')).toBe('https://a.test/1.png');
  fireEvent.error(image()!);
  expect(image()?.getAttribute('src')).toBe('https://b.test/1.png');
  fireEvent.error(image()!);
  expect(image()).toBeNull();
  expect(screen.getByText('fallback')).toBeTruthy();
});

it('shows a custom build without artwork and selects it on click', () => {
  const onSelect = vi.fn();
  const { container } = render(<PortraitCard build={build} selected={false} hasIssues onSelect={onSelect} />);
  const card = screen.getByRole('button', { name: /Test character/ });
  expect(card.getAttribute('aria-pressed')).toBe('false');
  expect(card.getAttribute('data-element')).toBe('ice');
  expect(container.querySelector('.portrait-art img')).toBeNull();
  expect(screen.getByRole('img', { name: t('character.hasIssues') })).toBeTruthy();
  fireEvent.click(card);
  expect(onSelect).toHaveBeenCalledOnce();
});

it('loads the pinned portrait for a game character', () => {
  const id = DATA_TABLES.characters[0]!.id;
  const { container } = render(<PortraitCard build={{ ...build, characterId: id }} selected hasIssues={false} onSelect={() => {}} />);
  expect(container.querySelector('.portrait-art img')?.getAttribute('src'))
    .toBe(`https://cdn.jsdelivr.net/gh/Mar-7th/StarRailRes@${ARTWORK_COMMIT}/image/character_preview/${id}.png`);
  expect(screen.queryByRole('img', { name: t('character.hasIssues') })).toBeNull();
});
