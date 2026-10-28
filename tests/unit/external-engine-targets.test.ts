import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import targets from '../fixtures/external-engine-targets-2026-10-28.json';

describe('internal external-engine validation cases', () => {
  it('preserves the original review snapshot and its limited validation results', () => {
    const snapshot = readFileSync('tests/fixtures/external-engine-targets-2026-10-28.json');
    expect(createHash('sha256').update(snapshot).digest('hex')).toBe('1c9ce295214aa7353cd625ba5095b6e38ad5e06640ddbacbb2fc0cd3bfdfbf4b');
    expect(targets.targets.map(target => target.name)).toEqual([
      'Halogen', 'Strixite', 'MLX (mlx-lm / MLX-VLM)', 'ExLlamaV3 (ExLlamaV2)',
      'Rulith Inference', 'SGLang', 'vLLM', 'Strata', 'TensorFold', 'vllm.cpp',
      'Mistral.rs', 'KTransformers', 'ik_llama.cpp', 'Mullama', 'llama.cpp', 'Gufo',
    ]);
    expect(targets.targets.every(target => target.builtin_external_adapter === false)).toBe(true);
    expect(targets.targets.filter(target => target.validation === 'cli_limited_pass')).toHaveLength(3);
    expect(targets.targets.filter(target => target.validation === 'unrun')).toHaveLength(13);
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
  it('retains the reviewed executable and argument alternatives as test data', () => {
    for (const id of ['mlx', 'vllm']) {
      const target = targets.targets.find(target => target.id === id)!;
      const alternatives = 'launch_alternatives' in target ? target.launch_alternatives : [];
      expect(alternatives).toHaveLength(2);
      for (const alternative of alternatives ?? []) {
        if (alternative.program.startsWith('Python')) expect(alternative.args[0]).toBe('-m');
      }
    }
  });
  it('keeps the validation catalog outside public assets and product source', () => {
    expect(existsSync('public/verification/external-engine-targets-2026-10-28.json')).toBe(false);
    for (const file of readdirSync('src', { recursive: true, encoding: 'utf8' })) {
      if (!/\.(?:ts|tsx|json)$/.test(file)) continue;
      const source = readFileSync(join('src', file), 'utf8');
      expect(source, file).not.toContain('external-engine-targets-2026-10-28');
      expect(source, file).not.toMatch(/(?:from\s*|import\s*\()\s*['"][^'"]*tests\/fixtures\//);
    }
  });
});
