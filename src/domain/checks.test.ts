import { describe, expect, it } from 'vitest';
import { runAtsChecks } from './checks';
import { createResume } from './resume';

describe('ATS checks', () => {
  it('reports deterministic warnings with field references', () => {
    const resume = createResume('Missing Contact', 'modern-compact');
    const results = runAtsChecks(resume);

    expect(results.some((result) => result.field === 'content.profile.email')).toBe(true);
    expect(results.every((result) => ['pass', 'warning', 'blocked'].includes(result.status))).toBe(true);
  });
});
