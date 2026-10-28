import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guideSlugs } from '@/content/guides/types';
import { getGuides } from '@/content/guides';
import { locales } from '@/i18n/config';

type InferenceEvidence = {
  actual_inference: boolean;
  digest_kind: string;
  model_sha256: string;
  engine_binary_sha256: string;
  request_sha256: string;
  request_text?: string;
  response_sha256: string;
  response_text: string;
};
type NativeProvenance = {
  source_commit: string;
  app_version: string;
  released: boolean;
  platform: string;
  native_backend: boolean;
  ipc_mock: boolean;
  binary_sha256: string;
  process_id: number;
  capture_session: string;
  captured_at: string;
  inference_evidence?: InferenceEvidence;
};
type Capture = NativeProvenance & {
  locale: string;
  id: string;
  file: string;
  width: number;
  height: number;
  sha256: string;
  evidence_file: string;
  evidence_sha256: string;
  focus?: { x: number; y: number; width: number; height: number };
};
type CaptureManifest = { source: string; captures: Capture[] };
type NativeCaptureEvidence = NativeProvenance & {
  image_sha256: string;
  native_origin: string;
  ui_observations: string[];
};
const collections = [
  { name: 'released and advanced guide screens', directory: 'public/screenshots/guides/v0.3.2' },
  { name: 'unreleased automatic-connection screens', directory: 'public/screenshots/guides/automatic-connection' },
  { name: 'homepage light and dark screens', directory: 'public/screenshots' },
] as const;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha256 = (value: unknown) => expect(value).toMatch(/^[a-f0-9]{64}$/);
const load = <T,>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

function publicCaptureFile(directory: string, file: string): string {
  expect(file).toBeTruthy();
  expect(isAbsolute(file)).toBe(false);
  const result = resolve(directory, file);
  expect(relative(resolve(directory), result)).not.toMatch(/^\.\.(?:[/\\]|$)/);
  return result;
}

function checkNoPrivateFields(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    expect(key).not.toMatch(/^(?:authorization|cookie|api_key|password|secret|webdriver_session(?:_id)?|hostname|host_name)$/i);
    checkNoPrivateFields(item);
  }
}

function checkCapture(directory: string, capture: Capture): void {
  const bytes = readFileSync(publicCaptureFile(directory, capture.file));
  expect(digest(bytes)).toBe(capture.sha256);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(capture.width);
  expect(bytes.readUInt32BE(20)).toBe(capture.height);
  expect(capture.native_backend).toBe(true);
  expect(capture.ipc_mock).toBe(false);
  expect(capture.source_commit).toMatch(/^[a-f0-9]{40}$/);
  expect(capture.app_version).toMatch(/^\d+\.\d+\.\d+(?:[-+].+)?$/);
  expect(capture.released).toBeTypeOf('boolean');
  if (capture.released) expect(capture.source_commit).toBe('e439b52038142439c8c85b112d2949687fa273f2');
  if (capture.source_commit === 'e439b52038142439c8c85b112d2949687fa273f2') expect(capture.released).toBe(true);
  expect(capture.platform).toBe('linux-x86_64');
  sha256(capture.binary_sha256);
  expect(Number.isInteger(capture.process_id) && capture.process_id > 0).toBe(true);
  expect(capture.capture_session.trim().length).toBeGreaterThanOrEqual(8);
  expect(Number.isNaN(Date.parse(capture.captured_at))).toBe(false);

  const evidenceBytes = readFileSync(publicCaptureFile(directory, capture.evidence_file));
  expect(digest(evidenceBytes)).toBe(capture.evidence_sha256);
  const evidence = JSON.parse(evidenceBytes.toString('utf8')) as NativeCaptureEvidence;
  checkNoPrivateFields(evidence);
  expect(evidence.image_sha256).toBe(capture.sha256);
  expect(evidence.native_origin).toBe('tauri://localhost');
  expect(evidence.ui_observations.length).toBeGreaterThan(0);
  for (const observation of evidence.ui_observations) expect(observation.trim()).toBeTruthy();
  for (const key of [
    'native_backend', 'ipc_mock', 'source_commit', 'app_version', 'released', 'platform',
    'binary_sha256', 'process_id', 'capture_session', 'captured_at',
  ] as const) expect(evidence[key], `${capture.file}: ${key}`).toEqual(capture[key]);

  // A success screen or a visible model answer needs actual execution evidence,
  // beyond the process evidence required by ordinary navigation/setup screens.
  if (capture.id === 'chat' || capture.id === 'auto-connect') expect(capture.inference_evidence).toBeDefined();
  if (capture.inference_evidence) {
    const inference = capture.inference_evidence;
    expect(inference.actual_inference).toBe(true);
    expect(['ui-conversation', 'http-payload']).toContain(inference.digest_kind);
    for (const key of ['model_sha256', 'engine_binary_sha256', 'request_sha256', 'response_sha256'] as const) sha256(inference[key]);
    expect(inference.response_text.trim()).toBeTruthy();
    if (inference.digest_kind === 'ui-conversation') {
      expect(inference.request_text?.trim()).toBeTruthy();
      expect(digest(Buffer.from(inference.request_text ?? '', 'utf8'))).toBe(inference.request_sha256);
      expect(digest(Buffer.from(inference.response_text, 'utf8'))).toBe(inference.response_sha256);
    }
    expect(evidence.inference_evidence).toEqual(inference);
  } else expect(evidence.inference_evidence).toBeUndefined();
  if (capture.focus) {
    expect(capture.focus.x).toBeGreaterThanOrEqual(0);
    expect(capture.focus.y).toBeGreaterThanOrEqual(0);
    expect(capture.focus.x + capture.focus.width).toBeLessThanOrEqual(100.01);
    expect(capture.focus.y + capture.focus.height).toBeLessThanOrEqual(100.01);
  }
}

describe('native desktop screenshot evidence', () => {
  it.each(collections)('checks file integrity and native provenance for $name', ({ directory }) => {
    const manifest = load<CaptureManifest>(`${directory}/manifest.json`);
    expect(manifest.source).toBe('aiolm/AioLM');
    expect(manifest.captures.length).toBeGreaterThan(0);
    expect(new Set(manifest.captures.map(capture => capture.file)).size).toBe(manifest.captures.length);
    expect(new Set(manifest.captures.map(capture => capture.evidence_file)).size).toBe(manifest.captures.length);
    for (const capture of manifest.captures) checkCapture(directory, capture);
    if (directory.endsWith('automatic-connection')) {
      for (const capture of manifest.captures) expect(capture.released).toBe(false);
    }
  });

  it('provides actual native records for both homepage themes', () => {
    const manifest = load<CaptureManifest>('public/screenshots/manifest.json');
    for (const theme of ['light', 'dark']) {
      expect(manifest.captures.some(capture => capture.file === `product-models-en-${theme}.png`)).toBe(true);
    }
  });

  it.each(locales)('provides matching visual steps and native captures in %s', async locale => {
    const captures = collections.slice(0, 2).flatMap(({ directory }) => load<CaptureManifest>(`${directory}/manifest.json`).captures);
    const [content, english] = await Promise.all([getGuides(locale), getGuides('en')]);
    for (const slug of guideSlugs) {
      const guide = content.guides[slug];
      expect(guide.sections.map(section => section.id)).toEqual(english.guides[slug].sections.map(section => section.id));
      const illustratedSteps = guide.sections.flatMap(section => [section, ...(section.more ?? [])]).filter(item => item.image);
      for (const step of illustratedSteps) {
        expect(step.caption?.trim()).toBeTruthy();
        const matching = captures.filter(capture => capture.locale === locale && capture.id === step.image);
        expect(matching, `${locale}/${slug}/${step.image}`).toHaveLength(1);
        expect(matching[0].native_backend).toBe(true);
        expect(matching[0].ipc_mock).toBe(false);
      }
    }
  });
});
