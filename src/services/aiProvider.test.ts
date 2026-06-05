import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAiAssistMessages,
  buildFitToJdMessages,
  buildJdMatchMessages,
  clearSessionApiKey,
  isAiConfigured,
  requestFitToJdDraft,
  requestJdMatchReport,
  requestReadinessReport,
  requestAiSuggestion,
  setSessionApiKey,
  type AiProviderSettings
} from './aiProvider';

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
    })).rejects.toThrow('AI provider returned no suggestion.');
  });

  it('requests CV quality readiness as a percent with reasons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        readinessPercent: 76,
        reasons: [
          { id: 'generic-bullets', severity: 'medium', message: 'Several bullets describe duties instead of outcomes.', impact: -12 }
        ]
      }) } }]
    }), { status: 200 })));

    const report = await requestReadinessReport(testSettings, {
      kind: 'cv-quality',
      resumeTitle: 'Ada Resume',
      resumeText: 'Ada Lovelace\nBuilt analytical systems.'
    });

    expect(report).toEqual({
      readinessPercent: 76,
      reasons: [
        { id: 'generic-bullets', severity: 'medium', message: 'Several bullets describe duties instead of outcomes.', impact: -12 }
      ]
    });
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
