import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeJsonLd, publicMetadata } from '@/lib/seo';
import { getPublicBenchmark } from '@/server/public-benchmark';
import { __setTestStore } from '@/server/store';
import type { BenchmarkStore, StoredRun } from '@/server/repository';

afterEach(() => { __setTestStore(null); vi.unstubAllEnvs(); });
describe('search publication safety', () => {
  const run = { public_id: 'public-id', owner_hash: 'private-owner', submission_id: 'private-submission', body_sha256: 'private-hash', hidden: false, deleted: false, benchmark: { model: {}, measurements: { status: 'ok', rows: ['large-private-row'] } }, summary: { model_label: 'Model' }, description_md: 'Description', revision: 1, created_at: '2026-01-01', updated_at: '2026-01-02' } as unknown as StoredRun;
  function useRun(value: StoredRun | null) {
    __setTestStore({ getRunByPublicId: async () => value } as unknown as BenchmarkStore);
  }
  it('serializes JSON-LD without allowing HTML script termination', () => {
    const data = { text: '</script><script>alert(1)</script>' };
    expect(serializeJsonLd(data)).not.toContain('<');
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
  it('uses the configured origin and exact locale for share URLs', () => {
    vi.stubEnv('SERVICE_ORIGIN', 'https://example.invalid');
    const metadata = publicMetadata('ko', '/benchmarks/abc', 'Model · AioLM', 'Description');
    expect(metadata.openGraph).toMatchObject({ url: 'https://example.invalid/ko/benchmarks/abc', locale: 'ko_KR' });
    expect(metadata.alternates?.canonical).toBe('/ko/benchmarks/abc');
  });
  it('excludes private storage fields and measurement rows from the server payload', async () => {
    useRun(run);
    const result = await getPublicBenchmark('public-id');
    expect(result.state).toBe('public');
    expect(JSON.stringify(result)).not.toMatch(/private-|large-private-row/);
    expect(result.state === 'public' && result.data.summary.model_label).toBe('Model');
  });
  it.each([null, { ...run, deleted: true }])('treats missing or deleted results as missing', async value => {
    useRun(value);
    expect(await getPublicBenchmark('public-id')).toEqual({ state: 'missing' });
  });
  it('does not include hidden records in server HTML or metadata', async () => {
    useRun({ ...run, hidden: true });
    expect(await getPublicBenchmark('public-id')).toEqual({ state: 'hidden' });
  });
  it('does not turn database outages into permanent not-found responses', async () => {
    __setTestStore({ getRunByPublicId: async () => { throw new Error('offline'); } } as unknown as BenchmarkStore);
    await expect(getPublicBenchmark('public-id')).rejects.toThrow('offline');
  });
});
