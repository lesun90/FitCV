import { describe, expect, it } from 'vitest';
import { getTemplate, templates } from './templates';
import { createResume } from './resume';

describe('template registry', () => {
  it('ships one template: the adapter-backed Awesome CV', () => {
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('awesome-cv');
  });

  it('every template has required base fields', () => {
    for (const template of templates) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.browserCompatibility.engine).toBeTruthy();
      expect(template.fixture.sampleResumeId).toBeTruthy();
    }
  });

  it('awesome-cv entryType fields match expected shape', () => {
    const template = getTemplate('awesome-cv');
    const cventry = template.entryTypes?.find((et) => et.id === 'cventry');
    expect(cventry).toBeDefined();
    expect(cventry?.fields.map((f) => f.id)).toContain('highlights');
    const highlightField = cventry?.fields.find((f) => f.id === 'highlights');
    expect(highlightField?.multiline).toBe(true);
  });

  it('awesome-cv sectionEnvs declare allowed entry types', () => {
    const template = getTemplate('awesome-cv');
    const experience = template.sectionEnvs?.find((e) => e.id === 'experience');
    expect(experience?.allowedEntryTypeIds).toContain('cventry');
    expect(experience?.allowsSubsectionHeading).toBe(true);
    const projects = template.sectionEnvs?.find((e) => e.id === 'projects');
    expect(projects?.allowedEntryTypeIds).toContain('projectentry');
  });

  it('createResume produces a resume compatible with the template', () => {
    const resume = createResume('Test', 'awesome-cv');
    expect(resume.content.flexSections).toEqual([]);
    expect(resume.content.profile.fullName).toBe('');
  });
});
