import type { Scenario } from '../state/scenario';
import { exportScenario, importScenario, type ScenarioImportResult } from '../state/scenario-json';

const version = '1';
const prefix = '#s=';

export function isScenarioLink(hash: string): boolean {
  return hash.startsWith(prefix);
}

export async function encodeScenarioLink(scenario: Scenario): Promise<string> {
  // Rebuild from the allowlist before any bytes go into the link.
  const safe = importScenario(exportScenario(scenario));
  if (!safe.ok) throw new Error('Invalid scenario structure');
  const json = exportScenario(safe.scenario);
  const stream = new Response(json).body!.pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const payload = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return `${prefix}${version}.${payload}`;
}

export async function decodeScenarioLink(hash: string): Promise<ScenarioImportResult> {
  const match = /^#s=(\d+)\.([A-Za-z0-9_-]+)$/.exec(hash);
  if (match && match[1] !== version) return { ok: false, issues: ['Scenario: unsupported link version'] };
  if (match?.[2]) {
    try {
      const binary = atob(match[2].replaceAll('-', '+').replaceAll('_', '/'));
      const bytes = Uint8Array.from(binary, (byte) => byte.charCodeAt(0));
      const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('deflate'));
      return importScenario(await new Response(stream).text());
    } catch {
      // Corrupted or truncated compressed payload.
    }
  }
  return { ok: false, issues: ['Scenario: invalid link'] };
}
