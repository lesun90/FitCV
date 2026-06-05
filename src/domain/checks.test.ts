import { describe, expect, it } from 'vitest';
import { buildAtsReadinessReport, runAtsChecks } from './checks';
import { createResume } from './resume';

describe('ATS checks', () => {
  it('reports deterministic warnings with field references', () => {
    const resume = createResume('Missing Contact', 'awesome-cv');
    const results = runAtsChecks(resume);

    expect(results.some((result) => result.field === 'content.profile.email')).toBe(true);
    expect(results.every((result) => ['pass', 'warning', 'blocked'].includes(result.status))).toBe(true);
  });

  it('calculates ATS readiness as a clamped percent with structured reasons', () => {
    const resume = createResume('Incomplete Resume', 'awesome-cv');
    resume.content.profile.fullName = '';
    resume.content.profile.email = '';
    resume.content.summary = 'x'.repeat(720);
    resume.content.profile.links = ['not a readable link'];
    resume.content.flexSections = [
      {
        id: 'section-exp',
        name: 'WORK EXPERIENCE',
        items: [{
          id: 'entry-1',
          type: 'cventry',
          fields: { position: 'Engineer', title: 'Company', date: 'Jan 2023 -- Present', highlights: 'Built parser-safe systems\nImproved document extraction' }
        }]
      },
      {
        id: 'section-skills',
        name: 'SKILLS',
        items: [{ id: 'entry-skills', type: 'cvskill', fields: { type: 'Tools', skills: 'TypeScript, React' } }]
      }
    ];

    const report = buildAtsReadinessReport(resume);

    expect(report).toMatchObject({
      kind: 'ats',
      methodologyVersion: 'ats-deterministic-v2',
    });
    expect(report.readinessPercent).toBeLessThan(40);
    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'missing-name',
        field: 'content.profile.fullName',
        severity: 'high',
        impact: -30
      }),
      expect.objectContaining({
        id: 'missing-email',
        field: 'content.profile.email',
        severity: 'medium',
        impact: -15
      })
    ]));
    expect(report.reasons.every((reason) => typeof reason.message === 'string' && reason.message.length > 0)).toBe(true);
  });

  it('keeps a complete resume near ready and records positive reasons', () => {
    const resume = createResume('Ready Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.profile.links = ['linkedin.com/in/ada'];
    resume.content.summary = 'Analytical engineer focused on durable technical systems.';
    resume.content.flexSections = [
      {
        id: 'section-exp',
        name: 'WORK EXPERIENCE',
        items: [{
          id: 'entry-1',
          type: 'cventry',
          fields: {
            position: 'Engineer',
            title: 'Analytical Engine Lab',
            date: 'Jan 2023 -- Present',
            highlights: 'Built parser-safe technical systems\nImproved extraction quality for documents'
          }
        }]
      },
      {
        id: 'section-skills',
        name: 'SKILLS',
        items: [{ id: 'entry-skills', type: 'cvskill', fields: { type: 'Tools', skills: 'TypeScript, React, PDF parsing' } }]
      },
      {
        id: 'section-education',
        name: 'EDUCATION',
        items: [{
          id: 'entry-education',
          type: 'cventry',
          fields: { position: 'Mathematics', title: 'Independent Study', date: '2020', highlights: 'Studied symbolic reasoning' }
        }]
      }
    ];

    const report = buildAtsReadinessReport(resume, {
      generatedText: 'Ada Lovelace ada@example.com WORK EXPERIENCE Built parser-safe technical systems Improved extraction quality for documents SKILLS TypeScript React EDUCATION Mathematics'
    });

    expect(report.readinessPercent).toBe(100);
    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'baseline-pass', severity: 'info', impact: 0 }),
      expect.objectContaining({ id: 'pdf-text-present', severity: 'info', impact: 0 })
    ]));
  });

  it('penalizes resumes that lack ATS section anchors and parseable content structure', () => {
    const resume = createResume('Crappy but Contactable', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '';
    resume.content.profile.location = '';
    resume.content.profile.links = [];
    resume.content.summary = 'I am a hard worker.';
    resume.content.flexSections = [
      { id: 'section-about', name: 'MY JOURNEY', items: [] },
      { id: 'section-tools', name: 'THE TOOLKIT', items: [] },
    ];

    const report = buildAtsReadinessReport(resume);

    expect(report.readinessPercent).toBeLessThan(70);
    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'missing-phone-or-location', impact: -6 }),
      expect.objectContaining({ id: 'missing-experience-section', impact: -18 }),
      expect.objectContaining({ id: 'missing-skills-section', impact: -12 }),
      expect.objectContaining({ id: 'nonstandard-section-heading', field: 'content.flexSections.section-about.name' }),
      expect.objectContaining({ id: 'empty-section', field: 'content.flexSections.section-tools' }),
    ]));
  });

  it('penalizes placeholder text, weak bullet structure, and unparseable dates', () => {
    const resume = createResume('Template Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.summary = 'Lorem ipsum dolor sit amet.';
    resume.content.flexSections = [{
      id: 'section-exp',
      name: 'WORK EXPERIENCE',
      items: [{
        id: 'entry-1',
        type: 'cventry',
        fields: {
          position: 'Engineer',
          title: 'Company',
          date: "Summer '23",
          highlights: 'Responsible for things'
        }
      }]
    }, {
      id: 'section-skills',
      name: 'SKILLS',
      items: [{
        id: 'entry-skills',
        type: 'cvskill',
        fields: { type: 'Tools', skills: 'Tool A, Tool B' }
      }]
    }];

    const report = buildAtsReadinessReport(resume);

    expect(report.readinessPercent).toBeLessThan(80);
    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'placeholder-text' }),
      expect.objectContaining({ id: 'thin-bullet-structure' }),
      expect.objectContaining({ id: 'unclear-date-format' }),
    ]));
  });

  it('uses generated PDF text as a parser smoke test when available', () => {
    const resume = createResume('Generated Text Mismatch', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.summary = 'Built analytical systems.';
    resume.content.flexSections = [{
      id: 'section-exp',
      name: 'WORK EXPERIENCE',
      items: [{
        id: 'entry-1',
        type: 'cventry',
        fields: {
          position: 'Engineer',
          title: 'Analytical Engine Lab',
          date: 'Jan 2023 -- Present',
          highlights: 'Built parser-safe technical systems\nImproved extraction quality'
        }
      }]
    }, {
      id: 'section-skills',
      name: 'SKILLS',
      items: [{
        id: 'entry-skills',
        type: 'cvskill',
        fields: { type: 'Tools', skills: 'TypeScript, React, PDF parsing' }
      }]
    }];

    const report = buildAtsReadinessReport(resume, { generatedText: 'Ada Lovelace' });

    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pdf-text-missing-key-content', impact: -16 })
    ]));
  });
});
