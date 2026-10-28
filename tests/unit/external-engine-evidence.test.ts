import { describe, expect, it } from 'vitest';
import report from '../../public/verification/external-cpu-2026-10-28.json';
import { getGuides } from '@/content/guides';
import { locales } from '@/i18n/config';

describe('published external CPU verification evidence', () => {
  it('separates actual CLI results, the initial failure and unverified engine/UI scope', () => {
    expect(report.synthetic).toBe(false);
    expect(report.application.version).toBe('0.3.2');
    expect(report.application.cli_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.model.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(report.files).toHaveLength(41);
    for (const file of report.files) expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.initial_attempt.steps.some(step => step.status === 'fail')).toBe(true);
    expect(report.rerun.steps).toHaveLength(9);
    expect(report.rerun.steps.every(step => step.status === 'pass')).toBe(true);
    expect(report.harness.unchanged_acceptance_checks).toBe(true);
    expect(JSON.stringify(report.limits)).toContain('Strata');
    expect(JSON.stringify(report.limits)).toContain('TensorFold');
    expect(JSON.stringify(report.limits)).toContain('F09');
    expect(JSON.stringify(report)).not.toMatch(/\/workspace\/|\/home\//);
  });
  it.each(locales)('links the evidence from the localized guide in %s', async locale => {
    const content = await getGuides(locale);
    const details = content.guides.adapters.sections.find(section => section.id === 'verified')?.more;
    expect(details?.[0]?.report?.href).toBe('/verification/external-cpu-2026-10-28.json');
    expect(details?.[0]?.report?.label.trim()).toBeTruthy();
    expect(content.guides.adapters.sections.find(section => section.id === 'files')?.table?.rows).toHaveLength(4);
  });
});
