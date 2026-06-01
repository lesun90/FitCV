import { describe, expect, it } from 'vitest';
import { analyzeTemplateCompatibility, templates, validateTemplateRegistry } from './templates';
import { createResume } from './resume';

describe('template registry', () => {
  it('ships curated templates including the first adapter-backed LaTeX layout', () => {
    expect(templates).toHaveLength(3);
    expect(new Set(templates.map((template) => template.id)).size).toBe(3);
    expect(templates.map((template) => template.id)).toContain('awesome-cv');
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

  it('documents schema, render mapping, validation, compatibility, and fixture metadata for every template', () => {
    expect(validateTemplateRegistry(templates)).toEqual([]);
    expect(templates.every((template) => template.schema.fields.length > 0)).toBe(true);
    expect(templates.every((template) => template.renderMapping.length > 0)).toBe(true);
    expect(templates.every((template) => template.validationRules.length > 0)).toBe(true);
    expect(templates.every((template) => template.browserCompatibility.engine.length > 0)).toBe(true);
    expect(templates.every((template) => template.fixture.sampleResumeId.length > 0)).toBe(true);
  });
});
