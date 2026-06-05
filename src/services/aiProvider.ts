import type { AiProvider, ProviderSettingsRecord } from '../domain/types';

export type { AiProvider };
export type AiAssistAction = 'rephrase' | 'shorten' | 'rewrite';
export type AiRewriteStyle = 'impact-focused' | 'ats-friendly' | 'executive' | 'technical' | 'plain-language';

export type AiProviderSettings = ProviderSettingsRecord;

type ProviderPreset = {
  label: string;
  endpointUrl: string;
  defaultModel: string;
  apiKeyUrl?: string;
  corsNote?: string;
};

export const PROVIDER_PRESETS: Record<AiProvider, ProviderPreset> = {
  openai: {
    label: 'OpenAI',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    label: 'DeepSeek',
    endpointUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  gemini: {
    label: 'Gemini',
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.0-flash',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    corsNote: 'Gemini may block direct browser requests. Use a local OpenAI-compatible proxy if you see CORS errors.',
  },
  claude: {
    label: 'Claude',
    endpointUrl: '',
    defaultModel: 'claude-opus-4-8',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    corsNote: "Anthropic's API blocks browser requests and uses a different message format. Point the endpoint to a local OpenAI-compatible proxy (e.g. LiteLLM) configured to forward to Claude.",
  },
  local: {
    label: 'Local LLM',
    endpointUrl: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'llama3.2',
  },
};

export type AiAssistRequest = {
  action: AiAssistAction;
  rewriteStyle?: AiRewriteStyle;
  fieldLabel: string;
  text: string;
  surroundingText?: string;
  userInstruction?: string;
};

export type AiAssistSuggestion = {
  replacement: string;
  rationale?: string;
  warning?: string;
};

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

let sessionApiKey = '';

export const setSessionApiKey = (apiKey: string) => {
  sessionApiKey = apiKey;
};

export const getSessionApiKey = () => sessionApiKey;

export const clearSessionApiKey = () => {
  sessionApiKey = '';
};

const styleLabel = (style?: AiRewriteStyle) => {
  switch (style) {
    case 'impact-focused': return 'Impact-focused';
    case 'ats-friendly': return 'ATS-friendly';
    case 'executive': return 'Executive';
    case 'technical': return 'Technical';
    case 'plain-language': return 'Plain language';
    default: return 'General CV';
  }
};

const actionInstruction = (request: AiAssistRequest) => {
  if (request.action === 'shorten') return 'Shorten this CV text while keeping the strongest facts, metrics, names, dates, and scope.';
  if (request.action === 'rephrase') return 'Rephrase this CV text for clarity and professional polish while preserving meaning.';
  return `Rewrite this CV text in a ${styleLabel(request.rewriteStyle)} style.`;
};

export const buildAiAssistMessages = (request: AiAssistRequest): ChatMessage[] => [
  {
    role: 'system',
    content: [
      'You are a CV writing assistant.',
      'Do not invent facts, claims, metrics, titles, employers, dates, tools, or outcomes.',
      'Preserve all facts, metrics, names, dates, capitalization that appears intentional, and user intent.',
      'For LaTeX source, preserve LaTeX commands and only rewrite human-readable text inside the selected content.',
      'Return strict JSON with keys: replacement, rationale, warning.',
      'The replacement must contain only the replacement text, without markdown fences.'
    ].join(' ')
  },
  {
    role: 'user',
    content: [
      `Action: ${request.action}`,
      `Style: ${styleLabel(request.rewriteStyle)}`,
      `Field: ${request.fieldLabel}`,
      `Instruction: ${actionInstruction(request)}`,
      request.userInstruction ? `User instruction: ${request.userInstruction}` : '',
      request.surroundingText ? `Surrounding context:\n${request.surroundingText}` : '',
      `Text:\n${request.text}`
    ].filter(Boolean).join('\n\n')
  }
];

const stripMarkdownFence = (content: string) => {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch?.[1]?.trim() ?? trimmed;
};

const extractJsonObject = (content: string) => {
  const normalized = stripMarkdownFence(content);
  if (normalized.startsWith('{') && normalized.endsWith('}')) return normalized;
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  return start >= 0 && end > start ? normalized.slice(start, end + 1) : normalized;
};

const suggestionFromParsedValue = (value: unknown): AiAssistSuggestion | undefined => {
  if (typeof value === 'string') return parseSuggestion(value);
  if (!value || typeof value !== 'object') return undefined;
  const parsed = value as Partial<AiAssistSuggestion>;
  return {
    replacement: String(parsed.replacement ?? '').trim(),
    rationale: parsed.rationale ? String(parsed.rationale) : undefined,
    warning: parsed.warning ? String(parsed.warning) : undefined
  };
};

const parseSuggestion = (content: string): AiAssistSuggestion => {
  const normalized = stripMarkdownFence(content);
  try {
    return suggestionFromParsedValue(JSON.parse(normalized)) ?? { replacement: normalized };
  } catch {
    try {
      return suggestionFromParsedValue(JSON.parse(extractJsonObject(normalized))) ?? { replacement: normalized };
    } catch {
      return { replacement: normalized };
    }
  }
};

const extractProviderErrorMessage = async (response: Response) => {
  const body = await response.text();
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const message = parsed.error?.message ?? parsed.message;
    return typeof message === 'string' ? message.trim() : body.trim();
  } catch {
    return body.trim();
  }
};

const buildProviderError = async (response: Response) => {
  if (response.status === 429) {
    return 'AI request limit reached. Try again later or check your provider quota.';
  }
  const providerMessage = await extractProviderErrorMessage(response);
  return [
    `AI request failed with ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
    providerMessage || 'Check endpoint, model, API key, and browser CORS support.'
  ].join('. ');
};

export const getApiKeyForRequest = (settings: AiProviderSettings) => settings.apiKey || sessionApiKey;

export const isAiConfigured = (settings?: AiProviderSettings) =>
  Boolean(settings?.endpointUrl.trim() && settings.model.trim());

export const requestAiSuggestion = async (
  settings: AiProviderSettings,
  request: AiAssistRequest
): Promise<AiAssistSuggestion> => {
  if (!isAiConfigured(settings)) throw new Error('AI settings are incomplete.');
  const apiKey = getApiKeyForRequest(settings);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(settings.endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      messages: buildAiAssistMessages(request),
      temperature: 0.2
    })
  });
  if (!response.ok) {
    throw new Error(await buildProviderError(response));
  }
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI provider returned no suggestion.');
  const suggestion = parseSuggestion(content);
  if (!suggestion.replacement) throw new Error('AI provider returned an empty suggestion.');
  return suggestion;
};
