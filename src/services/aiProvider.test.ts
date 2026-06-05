import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAiAssistMessages,
  clearSessionApiKey,
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
});
