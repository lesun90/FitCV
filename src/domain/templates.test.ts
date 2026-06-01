import { describe, expect, it } from 'vitest';
import { analyzeTemplateCompatibility, templates } from './templates';
import { createResume } from './resume';

describe('template registry', () => {
  it('ships at least two curated templates', () => {
    expect(templates).toHaveLength(2);
    expect(new Set(templates.map((template) => template.id)).size).toBe(2);
  });

  it('preserves unsupported fields when switching templates', () => {
    const resume = createResume('Portfolio CV', 'classic-ats');
    resume.content.projects.push({
      id: 'project-1',
      name: 'Compiler Workbench',
      description: 'Browser pipeline',
      highlights: ['PDF generation'],
      links: []
    });

    const result = analyzeTemplateCompatibility(resume, 'modern-compact');

    expect(result.unsupportedSections).toContain('projects');
    expect(resume.content.projects).toHaveLength(1);
  });
});
