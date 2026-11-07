import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// src/data and src/import follow the engine's rules (docs/ARCHITECTURE.md):
// no React, no DOM, no I/O, no network, no clock or randomness.
const SRC = fileURLToPath(new URL('../..', import.meta.url));
const LAYERS = ['data', 'import'].map((d) => join(SRC, d)).filter((d) => existsSync(d));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('data and import layer independence', () => {
  const files = LAYERS.flatMap(sourceFiles);

  it('finds layer source files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))('%s is framework-free and pure', (_, file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/from\s+['"](react|react-dom)(\/[^'"]*)?['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/ui\//);
    expect(src).not.toMatch(/from\s+['"]node:/);
    expect(src).not.toMatch(/\b(window|document|localStorage|sessionStorage)\./);
    expect(src).not.toMatch(/\bfetch\(|Date\.now\(|Math\.random\(/);
    expect(file.endsWith('.tsx')).toBe(false);
  });
});
