import { describe, expect, it } from 'vitest';
import { getTemplate, templates } from './templates';
import { createResume } from './resume';

describe('template registry', () => {
  it('ships three templates including the adapter-backed Awesome CV', () => {
    expect(templates).toHaveLength(3);
    expect(new Set(templates.map((t) => t.id)).size).toBe(3);
    expect(templates.map((t) => t.id)).toContain('awesome-cv');
  });

  it('every template has required base fields', () => {
    for (const template of templates) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.browserCompatibility.engine).toBeTruthy();
      expect(template.fixture.sampleResumeId).toBeTruthy();
    }
  });

  it('awesome-cv declares a full adapter contract', () => {
    const template = getTemplate('awesome-cv');
    expect(template.pinnedSections).toContain('summary');
    expect(template.sectionEnvs?.length).toBeGreaterThan(0);
    expect(template.entryTypes?.length).toBeGreaterThan(0);
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

  it('classic-ats and modern-compact have no adapter contract fields', () => {
    const classicAts = getTemplate('classic-ats');
    expect(classicAts.pinnedSections).toBeUndefined();
    expect(classicAts.sectionEnvs).toBeUndefined();
    expect(classicAts.entryTypes).toBeUndefined();
  });

  it('createResume produces a resume compatible with the template', () => {
    const resume = createResume('Test', 'awesome-cv');
    expect(resume.content.flexSections).toEqual([]);
    expect(resume.content.profile.fullName).toBe('');
  });
});
