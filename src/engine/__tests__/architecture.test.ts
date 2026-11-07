import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('engine independence', () => {
  const files = sourceFiles(ENGINE_DIR);

  it('finds engine source files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [relative(ENGINE_DIR, f), f]))('%s has no React/DOM/UI imports', (_, file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/from\s+['"](react|react-dom)(\/[^'"]*)?['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/(ui|data)\//);
    expect(src).not.toMatch(/\b(window|document|localStorage|sessionStorage)\./);
    expect(file.endsWith('.tsx')).toBe(false);
  });
});
