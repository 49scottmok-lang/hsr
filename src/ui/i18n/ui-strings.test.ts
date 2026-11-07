// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync, Visitor, type ESTree } from 'vite';
import { expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('..', import.meta.url));
const textAttributes = new Set(['alt', 'aria-description', 'aria-label', 'aria-valuetext', 'children', 'label', 'placeholder', 'title']);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsxFiles(path);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
  });
}

// Inspect expressions that can directly supply displayed text. Leave data lookups,
// conditions and function arguments (including t() keys) alone.
function renderedLiterals(node: ESTree.Node | null): string[] {
  switch (node?.type) {
    case 'JSXText': return [node.value];
    case 'Literal': return typeof node.value === 'string' ? [node.value] : [];
    case 'JSXExpressionContainer': return renderedLiterals(node.expression);
    case 'ConditionalExpression': return [...renderedLiterals(node.consequent), ...renderedLiterals(node.alternate)];
    case 'LogicalExpression': return [
      ...(node.operator === '&&' ? [] : renderedLiterals(node.left)),
      ...renderedLiterals(node.right),
    ];
    case 'BinaryExpression': return node.operator === '+' ? [...renderedLiterals(node.left), ...renderedLiterals(node.right)] : [];
    case 'ArrayExpression': return node.elements.flatMap(renderedLiterals);
    case 'TemplateLiteral': return [...node.quasis.map((part) => part.value.raw), ...node.expressions.flatMap(renderedLiterals)];
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'TSSatisfiesExpression': return renderedLiterals(node.expression);
    default: return [];
  }
}

function rawUiText(source: string, path: string): string[] {
  const { program, errors } = parseSync(path, source);
  expect(errors, path).toEqual([]);
  const literals: string[] = [];
  const visitChildren = (node: ESTree.JSXElement | ESTree.JSXFragment) => {
    literals.push(...node.children.flatMap(renderedLiterals));
  };
  new Visitor({
    JSXElement: visitChildren,
    JSXFragment: visitChildren,
    JSXAttribute(node) {
      if (node.name.type === 'JSXIdentifier' && textAttributes.has(node.name.name)) {
        literals.push(...renderedLiterals(node.value));
      }
    },
  }).visit(program);
  return literals.map((value) => value.trim()).filter(Boolean);
}

it('scans UI components for literal JSX copy', () => {
  const files = tsxFiles(UI_DIR);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    expect(rawUiText(readFileSync(file, 'utf8'), file), relative(UI_DIR, file)).toEqual([]);
  }
});

it('detects literal text, label attributes and conditional copy while allowing translation keys', () => {
  const sample = `const demo = <>
    <label htmlFor="input">Raw text</label>
    <input id="input" aria-label="Raw label" placeholder={t('app.title')} />
    <p>{value === 'crit' ? 'Raw branch' : t('character.title')}</p>
    <p>{'Raw expression'}</p>
  </>;`;
  expect(rawUiText(sample, 'sample.tsx')).toEqual(['Raw text', 'Raw label', 'Raw branch', 'Raw expression']);
});
