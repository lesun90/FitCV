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
      methodologyVersion: 'ats-deterministic-v3',
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
      }),
      expect.objectContaining({
        id: 'unclear-link',
        message: expect.stringContaining('not a readable link')
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
        name: 'Work Experience',
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
        name: 'Skills',
        items: [{ id: 'entry-skills', type: 'cvskill', fields: { type: 'Tools', skills: 'TypeScript, React, PDF parsing' } }]
      },
      {
        id: 'section-education',
        name: 'Education',
        items: [{
          id: 'entry-education',
          type: 'cventry',
          fields: { position: 'Mathematics', title: 'Independent Study', date: 'Jun 2020', highlights: 'Studied symbolic reasoning' }
        }]
      }
    ];

    const report = buildAtsReadinessReport(resume, {
      generatedText: 'Ada Lovelace ada@example.com Work Experience Built parser-safe technical systems Improved extraction quality for documents Skills TypeScript React Education Mathematics'
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

  it('flags vague date formats and ALL CAPS section headings, naming the offending values', () => {
    const resume = createResume('Template Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.summary = 'Builds reliable backend systems for analytics teams.';
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
          highlights: 'Shipped data pipelines for internal reporting tools'
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
      expect.objectContaining({
        id: 'unclear-date-format',
        field: 'content.flexSections.section-exp',
        message: expect.stringContaining("Summer '23")
      }),
      expect.objectContaining({
        id: 'all-caps-section-heading',
        field: 'content.flexSections.section-exp.name',
        message: expect.stringContaining('WORK EXPERIENCE'),
        suggestion: expect.stringContaining('Work Experience')
      }),
      expect.objectContaining({
        id: 'all-caps-section-heading',
        field: 'content.flexSections.section-skills.name'
      }),
    ]));
  });

  it('recognizes expanded standard section labels like "Honors & Awards" (dictionary fix)', () => {
    const resume = createResume('Awards Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.summary = 'Builds reliable backend systems for analytics teams.';
    resume.content.flexSections = [
      {
        id: 'section-exp',
        name: 'Experience',
        items: [{ id: 'entry-1', type: 'cventry', fields: { position: 'Engineer', title: 'Company', date: 'Mar 2022 -- Present', highlights: 'Shipped data pipelines for internal reporting tools' } }]
      },
      {
        id: 'section-skills',
        name: 'Skills',
        items: [{ id: 'entry-skills', type: 'cvskill', fields: { type: 'Tools', skills: 'TypeScript, React' } }]
      },
      {
        id: 'section-awards',
        name: 'Honors & Awards',
        items: [{ id: 'entry-award', type: 'cventry', fields: { position: 'Best Paper Award', title: 'ACM Conference', date: 'Jun 2022', highlights: 'Recognized for a novel contribution to distributed systems research' } }]
      }
    ];

    const report = buildAtsReadinessReport(resume);

    expect(report.reasons.find((item) => item.id === 'nonstandard-section-heading' && item.field === 'content.flexSections.section-awards.name')).toBeUndefined();
  });

  it('flags inconsistent date formatting across entries without double-counting a vague date', () => {
    const resume = createResume('Mixed Dates Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.summary = 'Builds reliable backend systems for analytics teams.';
    resume.content.flexSections = [
      {
        id: 'section-exp',
        name: 'Experience',
        items: [{ id: 'entry-1', type: 'cventry', fields: { position: 'Engineer', title: 'Company', date: 'Mar 2022 -- Present', highlights: 'Shipped data pipelines for internal reporting tools' } }]
      },
      {
        id: 'section-projects',
        name: 'Projects',
        items: [{ id: 'entry-project', type: 'cventry', fields: { position: 'Resume Builder', title: 'Side Project', date: '03/2022', highlights: 'Built a parsing-aware resume editor' } }]
      }
    ];

    const report = buildAtsReadinessReport(resume);

    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'inconsistent-date-format',
        field: 'content.flexSections.section-exp',
        message: expect.stringContaining('Mar 2022'),
        suggestion: expect.stringContaining('Mon YYYY')
      })
    ]));
    expect(report.reasons.some((item) => item.id === 'unclear-date-format')).toBe(false);
  });

  it('does not flag inconsistency when the only differing date is already caught as vague', () => {
    const resume = createResume('Vague Plus Clear Dates Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.summary = 'Builds reliable backend systems for analytics teams.';
    resume.content.flexSections = [
      {
        id: 'section-exp',
        name: 'Experience',
        items: [
          { id: 'entry-1', type: 'cventry', fields: { position: 'Engineer', title: 'Company A', date: 'Mar 2022 -- Present', highlights: 'Shipped data pipelines for internal reporting tools' } },
          { id: 'entry-2', type: 'cventry', fields: { position: 'Analyst', title: 'Company B', date: "Summer '19", highlights: 'Automated weekly reporting workflows' } }
        ]
      }
    ];

    const report = buildAtsReadinessReport(resume);

    expect(report.reasons.some((item) => item.id === 'unclear-date-format')).toBe(true);
    expect(report.reasons.some((item) => item.id === 'inconsistent-date-format')).toBe(false);
  });

  it('suggests a specific rename for nonstandard headings that match a known pattern, and a general list otherwise', () => {
    const resume = createResume('Creative Headings Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.summary = 'Builds reliable backend systems for analytics teams.';
    resume.content.flexSections = [
      {
        id: 'section-journey',
        name: 'My Journey',
        items: [{ id: 'entry-1', type: 'cventry', fields: { position: 'Engineer', title: 'Company', date: 'Mar 2022', highlights: 'Built parser-safe systems' } }]
      },
      {
        id: 'section-mystery',
        name: 'Et Cetera',
        items: [{ id: 'entry-2', type: 'cventry', fields: { position: 'Note', title: 'Misc', date: 'Mar 2022', highlights: 'Other things worth mentioning here' } }]
      }
    ];

    const report = buildAtsReadinessReport(resume);

    const journeyReason = report.reasons.find((item) => item.field === 'content.flexSections.section-journey.name');
    expect(journeyReason?.suggestion).toContain('Experience');

    const mysteryReason = report.reasons.find((item) => item.field === 'content.flexSections.section-mystery.name');
    expect(mysteryReason?.suggestion).toContain('Use a literal label parsers recognize');
  });

  it('names the offending value in hidden-contact-field and empty-section messages', () => {
    const resume = createResume('Hidden Field Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';
    resume.content.profile.email = 'ada@example.com';
    resume.content.profile.phone = '+1 555 0142';
    resume.content.profile.location = 'London, UK';
    resume.content.profile.hiddenFields = ['phone'];
    resume.content.summary = 'Builds reliable backend systems for analytics teams.';
    resume.content.flexSections = [
      {
        id: 'section-exp',
        name: 'Experience',
        items: [{ id: 'entry-1', type: 'cventry', fields: { position: 'Engineer', title: 'Company', date: 'Mar 2022', highlights: 'Built parser-safe systems' } }]
      },
      {
        id: 'section-langs',
        name: 'Languages',
        items: [{ id: 'entry-lang', type: 'cventry', fields: { skills: 'EN' } }]
      }
    ];

    const report = buildAtsReadinessReport(resume);

    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hidden-contact-field', message: expect.stringContaining('Your phone is hidden') }),
      expect.objectContaining({ id: 'empty-section', field: 'content.flexSections.section-langs', message: expect.stringMatching(/has almost no text \(\d+ characters\)/) }),
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
