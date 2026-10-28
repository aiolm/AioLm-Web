import { describe, expect, it } from 'vitest';
import report from '../../public/verification/external-cpu-2026-10-28.json';
import mistralrs from '../../public/verification/mistralrs-cpu-2026-10-28.json';
import vllmCpp from '../../public/verification/vllm-cpp-cpu-2026-10-28.json';
import { getGuides } from '@/content/guides';
import { locales } from '@/i18n/config';

describe('published external CPU verification evidence', () => {
  it.each([report, mistralrs, vllmCpp])('retains stricter actual recheck evidence for $engine.id', evidence => {
    const recheck = evidence.recheck;
    expect(recheck.synthetic).toBe(false);
    expect(recheck.harness_source_dirty).toBe(false);
    expect(recheck.cli_sha256).toBe(evidence.application.cli_sha256);
    expect(recheck.request_timeout_ms).toBe(120000);
    expect(recheck.exact_answer_required).toBe(true);
    expect(recheck.same_process_followup_required).toBe(true);
    expect(recheck.steps).toHaveLength(9);
    expect(recheck.steps.every(step => step.status === 'pass')).toBe(true);
    for (const number of ['A03', 'A05', 'A07']) {
      const step = recheck.steps.find(item => item.item.startsWith(number));
      expect(step?.evidence).toMatchObject({ content: '5', answerExact: true });
    }
    expect(recheck.steps.find(step => step.item.startsWith('A04'))?.evidence).toMatchObject({
      sameProcessAfterFollowup: true,
      followup: { content: '5', answerExact: true },
    });
    expect(recheck.steps.find(step => step.item.startsWith('A08'))?.evidence).toMatchObject({
      portClosed: true,
      terminated_process_count: 3,
    });
    expect(JSON.stringify(evidence)).not.toMatch(/\/workspace\/|\/home\/|\/Users\//);
  });
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
    const sections = content.guides.adapters.sections;
    const files = sections.find(section => section.id === 'files');
    expect(files?.table?.rows).toHaveLength(5);
    expect(files?.table?.rows[0]?.[1]).toContain('*.setup.json');
    expect(files?.table?.rows[1]?.[1]).toContain('*.engine.json');
    expect(files?.table?.rows[4]?.[1]).toContain('deployment.json');
    expect(files?.note).toContain('.engine.json');
    const automaticSave = { en: 'automatically saves', ko: '자동 저장', ja: '自動保存', zh: '自动保存' };
    expect(sections.find(section => section.id === 'review')?.steps?.[0]).toContain(automaticSave[locale]);
  });
});
