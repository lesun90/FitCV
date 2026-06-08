import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAiAssistMessages,
  buildFitToJdMessages,
  buildImportFromCvMessages,
  buildJdMatchMessages,
  clearSessionApiKey,
  isAiConfigured,
  requestFitToJdDraft,
  requestProviderConnectionCheck,
  requestImportFromCv,
  requestJdMatchReport,
  requestReadinessReport,
  requestAiSuggestion,
  setSessionApiKey,
  type AiProviderSettings
} from './aiProvider';
import type { FlexSubSection } from '../domain/types';

const testSettings: AiProviderSettings = {
  id: 'default',
  schemaVersion: 1,
  endpointUrl: 'https://ai.example.test/v1/chat/completions',
  model: 'cv-model',
  rememberApiKey: false,
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z'
};

describe('AI provider service', () => {
  afterEach(() => {
    clearSessionApiKey();
    vi.unstubAllGlobals();
  });

  it('builds CV-oriented prompts that preserve facts and LaTeX commands', () => {
    const messages = buildAiAssistMessages({
      action: 'rewrite',
      rewriteStyle: 'ats-friendly',
      fieldLabel: 'Experience bullet',
      text: '\\item Led launch for 12 vehicles in Q4.',
      surroundingText: 'WORK EXPERIENCE'
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain('ATS-friendly');
    expect(serialized).toContain('Do not invent');
    expect(serialized).toContain('preserve LaTeX commands');
    expect(serialized).toContain('\\item Led launch for 12 vehicles in Q4.');
  });

  it('includes custom rewrite instructions in the provider prompt', () => {
    const messages = buildAiAssistMessages({
      action: 'rewrite',
      fieldLabel: 'Summary',
      text: 'Built reliable autonomy systems.',
      userInstruction: 'Make this sound more senior and concise.'
    });

    expect(JSON.stringify(messages)).toContain('Make this sound more senior and concise.');
  });

  it('sends provider-neutral OpenAI-compatible requests with remembered or session keys', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ replacement: 'Led Q4 launch for 12 vehicles.', rationale: 'Sharper impact.' }) } }]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    setSessionApiKey('session-secret');

    const result = await requestAiSuggestion(testSettings, {
      action: 'shorten',
      fieldLabel: 'Experience bullet',
      text: 'Led Q4 launch for 12 vehicles across multiple teams.'
    });

    expect(result).toEqual({ replacement: 'Led Q4 launch for 12 vehicles.', rationale: 'Sharper impact.' });
    expect(fetchMock).toHaveBeenCalledWith(testSettings.endpointUrl, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer session-secret' })
    }));
    const init = fetchMock.mock.calls[0][1]!;
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'cv-model' });
  });

  it('shows only replacement text when providers wrap suggestion JSON in markdown fences', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '```json\n{"replacement":"Led Q4 launch for 12 vehicles.","rationale":"Sharper impact."}\n```' } }]
    }), { status: 200 })));

    const result = await requestAiSuggestion(testSettings, {
      action: 'shorten',
      fieldLabel: 'Experience bullet',
      text: 'Led Q4 launch for 12 vehicles across multiple teams.'
    });

    expect(result).toEqual({ replacement: 'Led Q4 launch for 12 vehicles.', rationale: 'Sharper impact.' });
  });

  it('shows only replacement text when providers double-encode suggestion JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(JSON.stringify({ replacement: 'Built reliable autonomy systems.', warning: 'Verify scope.' })) } }]
    }), { status: 200 })));

    const result = await requestAiSuggestion(testSettings, {
      action: 'rephrase',
      fieldLabel: 'Summary',
      text: 'Built reliable autonomy systems.'
    });

    expect(result).toEqual({ replacement: 'Built reliable autonomy systems.', warning: 'Verify scope.' });
  });

  it('keeps provider rate limit responses concise', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'You exceeded your current quota.' }
    }), { status: 429, statusText: 'Too Many Requests' })));
    const settings: AiProviderSettings = {
      id: 'default',
      schemaVersion: 1,
      endpointUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o',
      rememberApiKey: false,
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z'
    };

    await expect(requestAiSuggestion(settings, {
      action: 'rephrase',
      fieldLabel: 'Summary',
      text: 'Built reliable autonomy systems.'
    })).rejects.toThrow('AI request limit reached. Try again later or check your provider quota.');
  });

  it('surfaces provider error details when connection checks fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'The model cv-model does not exist for this API key.' }
    }), { status: 404, statusText: 'Not Found' })));

    await expect(requestProviderConnectionCheck(testSettings))
      .rejects.toThrow('The model cv-model does not exist for this API key.');
  });

  it('isAiConfigured returns false when endpoint or model is blank', () => {
    expect(isAiConfigured(undefined)).toBe(false);
    expect(isAiConfigured({ ...testSettings, endpointUrl: '  ' })).toBe(false);
    expect(isAiConfigured({ ...testSettings, model: '' })).toBe(false);
    expect(isAiConfigured(testSettings)).toBe(true);
  });

  it('throws when the provider returns no suggestion content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: null } }]
    }), { status: 200 })));

    await expect(requestAiSuggestion(testSettings, {
      action: 'rephrase',
      fieldLabel: 'Summary',
      text: 'Built reliable systems.'
    })).rejects.toThrow('AI provider returned no content.');
  });

  it('requests CV quality readiness as a senior recruiter review with suggestions', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        readinessPercent: 76,
        reasons: [
          {
            id: 'generic-bullets',
            severity: 'medium',
            message: 'Several bullets describe duties instead of outcomes.',
            impact: -12,
            suggestion: 'Rewrite the strongest bullets to include scope, result, metric, or business impact.'
          }
        ]
      }) } }]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const report = await requestReadinessReport(testSettings, {
      kind: 'cv-quality',
      resumeTitle: 'Ada Resume',
      resumeText: 'Ada Lovelace\nBuilt analytical systems.'
    });

    expect(report).toEqual({
      readinessPercent: 76,
      reasons: [
        {
          id: 'generic-bullets',
          severity: 'medium',
          message: 'Several bullets describe duties instead of outcomes.',
          impact: -12,
          suggestion: 'Rewrite the strongest bullets to include scope, result, metric, or business impact.'
        }
      ]
    });
    const init = fetchMock.mock.calls[0][1]!;
    const body = JSON.parse(String(init.body));
    expect(JSON.stringify(body.messages)).toContain('senior recruiter and resume reviewer');
    expect(JSON.stringify(body.messages)).toContain('suggestion must explain how to improve');
  });

  it('keeps readiness reasons compatible when providers omit suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        readinessPercent: 81,
        reasons: [
          { id: 'clear-structure', severity: 'info', message: 'The resume structure is easy to scan.', impact: 4 }
        ]
      }) } }]
    }), { status: 200 })));

    const report = await requestReadinessReport(testSettings, {
      kind: 'cv-quality',
      resumeTitle: 'Ada Resume',
      resumeText: 'Ada Lovelace\nBuilt analytical systems.'
    });

    expect(report.reasons).toEqual([
      { id: 'clear-structure', severity: 'info', message: 'The resume structure is easy to scan.', impact: 4 }
    ]);
  });

  it('builds fit-to-JD prompts that return proposed edits separate from scoring', () => {
    const messages = buildFitToJdMessages({
      resumeTitle: 'Ada Resume',
      resumeText: 'Ada Lovelace\nBuilt browser tools.',
      jobDescriptionText: 'Frontend engineer building accessible tools.'
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain('Return strict JSON with key: proposedChanges');
    expect(serialized).toContain('Do not return a JD Match score');
    expect(serialized).toContain('Do not invent facts');
    expect(serialized).toContain('Frontend engineer building accessible tools.');
  });

  it('requests structured fit-to-JD proposed changes with risk flags', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        proposedChanges: [{
          targetField: 'content.summary',
          before: 'Built browser tools.',
          after: 'Built accessible browser tools.',
          rationale: 'Matches the accessibility requirement.',
          jdEvidence: 'accessible tools',
          riskFlags: ['verify-scope']
        }]
      }) } }]
    }), { status: 200 })));

    const result = await requestFitToJdDraft(testSettings, {
      resumeTitle: 'Ada Resume',
      resumeText: 'Ada Lovelace\nBuilt browser tools.',
      jobDescriptionText: 'Frontend engineer building accessible tools.'
    });

    expect(result.proposedChanges).toEqual([{
      targetField: 'content.summary',
      before: 'Built browser tools.',
      after: 'Built accessible browser tools.',
      rationale: 'Matches the accessibility requirement.',
      jdEvidence: 'accessible tools',
      riskFlags: ['verify-scope']
    }]);
  });

  it('rejects malformed fit-to-JD output before persistence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ proposedChanges: [{ targetField: 'notes', after: '' }] }) } }]
    }), { status: 200 })));

    await expect(requestFitToJdDraft(testSettings, {
      resumeTitle: 'Ada Resume',
      resumeText: 'Ada Lovelace',
      jobDescriptionText: 'Frontend engineer'
    })).rejects.toThrow('AI provider returned no valid fit-to-JD changes.');
  });

  it('builds JD Match prompts without asking for proposed edits', () => {
    const messages = buildJdMatchMessages({
      resumeTitle: 'Ada fitted CV',
      resumeText: 'Ada Lovelace\nBuilt accessible browser tools.',
      jobDescriptionText: 'Frontend engineer building accessible tools.'
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain('Return strict JSON with keys: readinessPercent, reasons');
    expect(serialized).toContain('Do not return proposed edits');
    expect(serialized).toContain('JD Match Readiness');
  });

  it('builds extraction-only import prompt with dynamic template vocabulary', () => {
    const messages = buildImportFromCvMessages({
      text: 'Ada Lovelace\nSkills: Python, TypeScript',
      sectionEnvs: [
        { id: 'cvskills', label: 'Skills', allowedEntryTypeIds: ['cvskill'] },
        { id: 'experience', label: 'Experience', allowedEntryTypeIds: ['cventry'], allowsSubsectionHeading: true },
      ],
      entryTypes: [
        { id: 'cvskill', label: 'Skill Group', fields: [{ id: 'type', label: 'Category' }, { id: 'skills', label: 'Skills' }] },
        { id: 'cventry', label: 'CV Entry', fields: [{ id: 'position', label: 'Position' }, { id: 'date', label: 'Date' }] },
      ],
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain('Do NOT rephrase');
    expect(serialized).toContain('verbatim');
    expect(serialized).toContain('Do not invent');
    expect(serialized).toContain('cvskills');
    expect(serialized).toContain('cvskill');
    expect(serialized).toContain('\\"type\\"');
    expect(serialized).toContain('\\"skills\\"');
    expect(serialized).toContain('experience');
    expect(serialized).toContain('cventry');
    expect(serialized).toContain('Ada Lovelace');
    expect(serialized).toContain('MULTILINE FIELDS');
    expect(serialized).toContain('SECTION MAPPING');
    expect(serialized).toContain('EXTRACTION RULES');
  });

  it('includes a concrete multiline example in the import prompt when the template has a multiline field', () => {
    const messages = buildImportFromCvMessages({
      text: 'Ada Lovelace',
      sectionEnvs: [
        { id: 'experience', label: 'Experience', allowedEntryTypeIds: ['cventry'] },
      ],
      entryTypes: [
        { id: 'cventry', label: 'CV Entry', fields: [
          { id: 'position', label: 'Position' },
          { id: 'title', label: 'Title' },
          { id: 'highlights', label: 'Highlights', multiline: true },
        ]},
      ],
    });
    const serialized = JSON.stringify(messages);

    // The example should use \n as separator (shown as \\n in the prompt text, serialised as \\\\n)
    expect(serialized).toContain('First bullet point');
    expect(serialized).toContain('Second bullet point');
    // Field descriptions should annotate multiline fields
    expect(serialized).toContain('NOT an array');
  });

  it('regenerates all IDs in imported content, discarding AI-provided IDs', async () => {
    const aiProvidedIds = {
      sectionId: 'ai-section-id-must-not-survive',
      subId: 'ai-sub-id-must-not-survive',
      entryId: 'ai-entry-id-must-not-survive',
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        profile: { fullName: 'Ada Lovelace', email: 'ada@example.com', headline: 'Engineer', phone: '', location: '', links: [], extraInfo: '' },
        summary: 'Computing pioneer.',
        flexSections: [{
          id: aiProvidedIds.sectionId,
          name: 'SKILLS',
          items: [{ id: aiProvidedIds.subId, environment: 'cvskills', items: [{ id: aiProvidedIds.entryId, type: 'cvskill', fields: { type: 'Languages', skills: 'Python, TypeScript' } }] }],
        }],
      }) } }]
    }), { status: 200 })));

    const result = await requestImportFromCv(testSettings, {
      text: 'Ada Lovelace\nSkills: Python, TypeScript',
      sectionEnvs: [{ id: 'cvskills', label: 'Skills', allowedEntryTypeIds: ['cvskill'] }],
      entryTypes: [{ id: 'cvskill', label: 'Skill Group', fields: [{ id: 'type', label: 'Category' }, { id: 'skills', label: 'Skills' }] }],
    });

    expect(result.profile.fullName).toBe('Ada Lovelace');
    expect(result.profile.email).toBe('ada@example.com');
    expect(result.summary).toBe('Computing pioneer.');
    expect(result.flexSections).toHaveLength(1);
    expect(result.flexSections[0].id).not.toBe(aiProvidedIds.sectionId);
    const sub = result.flexSections[0].items[0] as FlexSubSection;
    expect(sub.id).not.toBe(aiProvidedIds.subId);
    expect(sub.items[0].id).not.toBe(aiProvidedIds.entryId);
    expect((sub.items[0] as { fields: Record<string, string> }).fields.skills).toBe('Python, TypeScript');
  });

  it('filters out subsections with invalid environment values and entries with invalid type values', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        profile: { fullName: 'Ada', email: '', headline: '', phone: '', location: '', links: [], extraInfo: '' },
        summary: '',
        flexSections: [
          { name: 'VALID', items: [{ environment: 'cvskills', items: [{ type: 'cvskill', fields: { type: 'Languages', skills: 'Python' } }] }] },
          { name: 'BAD ENV', items: [{ environment: 'hallucinated-env', items: [{ type: 'cvskill', fields: {} }] }] },
          { name: 'BAD TYPE', items: [{ environment: 'cvskills', items: [{ type: 'hallucinated-type', fields: {} }] }] },
        ],
      }) } }]
    }), { status: 200 })));

    const result = await requestImportFromCv(testSettings, {
      text: 'Ada skills: Python',
      sectionEnvs: [{ id: 'cvskills', label: 'Skills', allowedEntryTypeIds: ['cvskill'] }],
      entryTypes: [{ id: 'cvskill', label: 'Skill Group', fields: [{ id: 'type', label: 'Category' }, { id: 'skills', label: 'Skills' }] }],
    });

    const validSection = result.flexSections.find((s) => s.name === 'VALID');
    const badEnvSection = result.flexSections.find((s) => s.name === 'BAD ENV');
    const badTypeSection = result.flexSections.find((s) => s.name === 'BAD TYPE');

    expect(validSection).toBeDefined();
    expect((validSection!.items[0] as FlexSubSection).items).toHaveLength(1);
    expect(badEnvSection).toBeDefined();
    expect(badEnvSection!.items).toHaveLength(0);
    expect(badTypeSection).toBeDefined();
    expect((badTypeSection!.items[0] as FlexSubSection).items).toHaveLength(0);
  });

  it('coerces array field values in imported entries to newline-joined strings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        profile: { fullName: 'Ada Lovelace', email: '', headline: '', phone: '', location: '', links: [], extraInfo: '' },
        summary: '',
        flexSections: [{
          name: 'EXPERIENCE',
          items: [{
            environment: 'experience',
            items: [{
              type: 'cventry',
              fields: {
                position: 'Senior Engineer',
                title: 'Acme Corp',
                date: '2020–2023',
                highlights: ['Built system X', 'Shipped feature Y', 'Led team Z'],
              },
            }],
          }],
        }],
      }) } }]
    }), { status: 200 })));

    const result = await requestImportFromCv(testSettings, {
      text: 'Ada Lovelace experience',
      sectionEnvs: [{ id: 'experience', label: 'Experience', allowedEntryTypeIds: ['cventry'] }],
      entryTypes: [{
        id: 'cventry',
        label: 'CV Entry',
        fields: [
          { id: 'position', label: 'Position' },
          { id: 'title', label: 'Title' },
          { id: 'date', label: 'Date' },
          { id: 'highlights', label: 'Highlights', multiline: true },
        ],
      }],
    });

    const sub = result.flexSections[0]?.items[0] as FlexSubSection;
    const entry = sub?.items[0] as { fields: Record<string, string> };
    expect(entry.fields.highlights).toBe('Built system X\nShipped feature Y\nLed team Z');
    expect(entry.fields.position).toBe('Senior Engineer');
  });

  it('requests AI-assisted JD Match readiness reports independently from fit proposals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        readinessPercent: 88,
        reasons: [
          { id: 'keyword-coverage', severity: 'info', field: 'content.summary', message: 'Strong accessibility keyword coverage.', impact: 0 },
          { id: 'missing-evidence', severity: 'medium', message: 'No explicit React evidence found.', impact: -8 }
        ]
      }) } }]
    }), { status: 200 })));

    const result = await requestJdMatchReport(testSettings, {
      resumeTitle: 'Ada fitted CV',
      resumeText: 'Ada Lovelace\nBuilt accessible browser tools.',
      jobDescriptionText: 'Frontend engineer building accessible React tools.'
    });

    expect(result).toEqual({
      readinessPercent: 88,
      reasons: [
        { id: 'keyword-coverage', severity: 'info', field: 'content.summary', message: 'Strong accessibility keyword coverage.', impact: 0 },
        { id: 'missing-evidence', severity: 'medium', message: 'No explicit React evidence found.', impact: -8 }
      ]
    });
  });
});
