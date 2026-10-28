import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import targets from '../../public/verification/external-engine-targets-2026-10-28.json';
import { getGuides } from '@/content/guides';
import { locales } from '@/i18n/config';

describe('required external engine targets', () => {
  it('keeps the requested engines distinct from installed or fully verified support', () => {
    expect(targets.targets.map(target => target.name)).toEqual([
      'Halogen', 'Strixite', 'MLX (mlx-lm / MLX-VLM)', 'ExLlamaV3 (ExLlamaV2)',
      'Rulith Inference', 'SGLang', 'vLLM', 'Strata', 'TensorFold', 'vllm.cpp',
      'Mistral.rs', 'KTransformers', 'ik_llama.cpp', 'Mullama', 'llama.cpp', 'Gufo',
    ]);
    expect(targets.targets.every(target => target.builtin_external_adapter === false)).toBe(true);
    for (const target of targets.targets) {
      expect(target.sources.length).toBeGreaterThan(0);
      for (const source of target.sources) expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
      if (target.validation === 'cli_limited_pass') {
        const evidence = JSON.parse(readFileSync(`public${'evidence' in target ? target.evidence : ''}`, 'utf8'));
        expect(evidence.synthetic).toBe(false);
        expect(evidence.rerun.steps).toHaveLength(9);
        expect(evidence.rerun.steps.every((step: { status: string }) => step.status === 'pass')).toBe(true);
      }
    }
  });
  it.each(locales)('offers one equally presented file guide per engine in %s', async locale => {
    const content = await getGuides(locale);
    const sections = content.guides['external-engines'].sections;
    const entries = sections[0].more;
    expect(entries).toHaveLength(16);
    expect(entries?.map(entry => entry.title)).toEqual(targets.targets.map((target, index) => `${index + 1}. ${target.name}`));
    for (const id of ['mlx', 'vllm']) {
      const target = targets.targets.find(target => target.id === id)!;
      const alternatives = 'launch_alternatives' in target ? target.launch_alternatives : [];
      expect(alternatives).toHaveLength(2);
      const displayed = entries?.[targets.targets.indexOf(target)].code ?? '';
      for (const alternative of alternatives ?? []) {
        expect(displayed).toContain(alternative.args.join('\n'));
        if (alternative.program.startsWith('Python')) expect(alternative.args[0]).toBe('-m');
      }
    }
    for (const entry of entries ?? []) {
      expect(entry.body.length).toBeGreaterThanOrEqual(5);
      expect(entry.links?.every(link => !link.href.endsWith('.md'))).toBe(true);
    }
  });
});
