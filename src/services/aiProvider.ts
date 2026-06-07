import { createId } from '../domain/ids';
import { emptyContent } from '../domain/resume';
import type { AiProvider, EntryTypeDefinition, FittedCvRiskFlag, FlexEntry, FlexSection, FlexSubSection, ProviderSettingsRecord, ResumeContent, ScoringReportRecord, SectionEnvDefinition } from '../domain/types';
import { storage } from './storage';

export type { AiProvider };
export type AiAssistAction = 'rephrase' | 'shorten' | 'rewrite';
export type AiRewriteStyle = 'impact-focused' | 'ats-friendly' | 'executive' | 'technical' | 'plain-language';

export type AiProviderSettings = ProviderSettingsRecord;

type ProviderPreset = {
  label: string;
  endpointUrl: string;
  defaultModel: string;
  models: string[];
  apiKeyUrl?: string;
  corsNote?: string;
};

export const PROVIDER_PRESETS: Record<AiProvider, ProviderPreset> = {
  openai: {
    label: 'OpenAI',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    label: 'DeepSeek',
    endpointUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  gemini: {
    label: 'Gemini',
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.5-flash-lite',
    models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    corsNote: 'Gemini may block direct browser requests. Use a local OpenAI-compatible proxy if you see CORS errors.',
  },
  claude: {
    label: 'Claude',
    endpointUrl: '',
    defaultModel: 'claude-opus-4-8',
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    corsNote: "Anthropic's API blocks browser requests and uses a different message format. Point the endpoint to a local OpenAI-compatible proxy (e.g. LiteLLM) configured to forward to Claude.",
  },
  local: {
    label: 'Local LLM',
    endpointUrl: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'mistral', 'phi3', 'qwen2.5'],
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

export type AiProviderConnectionCheck = {
  checkedAt: string;
  model: string;
  providerLabel: string;
};

export type ReadinessReportRequest = {
  kind: Extract<ScoringReportRecord['kind'], 'cv-quality' | 'jd-match'>;
  resumeTitle: string;
  resumeText: string;
  jobDescriptionText?: string;
};

export type AiReadinessResult = Pick<ScoringReportRecord, 'readinessPercent' | 'reasons'>;

export type FitToJdRequest = {
  resumeTitle: string;
  resumeText: string;
  jobDescriptionText: string;
};

export type FitToJdProposedChange = {
  targetField: string;
  before: string;
  after: string;
  rationale: string;
  jdEvidence?: string;
  riskFlags: FittedCvRiskFlag[];
};

export type FitToJdDraftResult = {
  proposedChanges: FitToJdProposedChange[];
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

export const buildReadinessMessages = (request: ReadinessReportRequest): ChatMessage[] => [
  {
    role: 'system',
    content: [
      'You evaluate resume readiness.',
      'Do not invent facts, claims, metrics, titles, employers, dates, tools, or outcomes.',
      'Return strict JSON with keys: readinessPercent, reasons.',
      'readinessPercent must be an integer from 0 to 100.',
      'reasons must be an array of objects with keys: id, severity, message, impact.',
      'severity must be one of info, medium, high.',
      'Use concise reason messages and do not include a separate improvement section.'
    ].join(' ')
  },
  {
    role: 'user',
    content: [
      `Readiness kind: ${request.kind}`,
      `Resume title: ${request.resumeTitle}`,
      request.kind === 'jd-match' && request.jobDescriptionText ? `Job description:\n${request.jobDescriptionText}` : '',
      `Resume text:\n${request.resumeText}`
    ].filter(Boolean).join('\n\n')
  }
];

export const buildFitToJdMessages = (request: FitToJdRequest): ChatMessage[] => [
  {
    role: 'system',
    content: [
      'You create fitted CV change proposals from a base resume and job description.',
      'Do not invent facts, claims, metrics, titles, employers, dates, tools, outcomes, or qualifications.',
      'Flag weakly supported or unsupported additions with riskFlags.',
      'Return strict JSON with key: proposedChanges.',
      'Each proposedChanges item must include targetField, before, after, rationale, jdEvidence, riskFlags.',
      'targetField must be a FitCV content path such as content.summary, content.profile.headline, or content.flexSections.<sectionId>.entries.<entryId>.fields.<fieldKey>.',
      'Do not return a JD Match score or readinessPercent in this response.'
    ].join(' ')
  },
  {
    role: 'user',
    content: [
      `Resume title: ${request.resumeTitle}`,
      `Job description:\n${request.jobDescriptionText}`,
      `Resume text:\n${request.resumeText}`
    ].join('\n\n')
  }
];

export const buildJdMatchMessages = (request: FitToJdRequest): ChatMessage[] => [
  {
    role: 'system',
    content: [
      'You evaluate JD Match Readiness for a fitted CV against a job description.',
      'Do not invent facts, claims, metrics, titles, employers, dates, tools, outcomes, or qualifications.',
      'Evaluate keyword coverage, required skills, role alignment, seniority signals, missing evidence, overclaim risk, and unused strong evidence.',
      'Return strict JSON with keys: readinessPercent, reasons.',
      'readinessPercent must be an integer from 0 to 100.',
      'reasons must be an array of objects with keys: id, field, severity, message, impact.',
      'severity must be one of info, medium, high.',
      'Do not return proposed edits in this response.'
    ].join(' ')
  },
  {
    role: 'user',
    content: [
      `Resume title: ${request.resumeTitle}`,
      `Job description:\n${request.jobDescriptionText}`,
      `Fitted CV text:\n${request.resumeText}`
    ].join('\n\n')
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

const parseReadinessResult = (content: string): AiReadinessResult => {
  const normalized = stripMarkdownFence(content);
  const parsed = JSON.parse(extractJsonObject(normalized)) as Partial<AiReadinessResult>;
  const readinessPercent = Math.max(0, Math.min(100, Math.round(Number(parsed.readinessPercent ?? 0))));
  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map((item, index) => {
    const reason = item as Partial<ScoringReportRecord['reasons'][number]>;
    const severity = reason.severity === 'high' || reason.severity === 'medium' || reason.severity === 'info' ? reason.severity : 'info';
    return {
      id: String(reason.id ?? `ai-reason-${index + 1}`),
      field: reason.field ? String(reason.field) : undefined,
      severity,
      message: String(reason.message ?? '').trim(),
      impact: typeof reason.impact === 'number' ? reason.impact : undefined
    };
  }).filter((reason) => reason.message) : [];
  return { readinessPercent, reasons };
};

const VALID_RISK_FLAGS: FittedCvRiskFlag[] = ['unsupported-claim', 'verify-scope', 'new-metric', 'new-skill', 'seniority-mismatch'];

const isSupportedTargetField = (field: string) =>
  field === 'content.summary'
    || /^content\.profile\.[a-zA-Z][\w]*$/.test(field)
    || /^content\.flexSections\.[^.\s]+\.entries\.[^.\s]+\.fields\.[^.\s]+$/.test(field);

const parseFitToJdResult = (content: string): FitToJdDraftResult => {
  const normalized = stripMarkdownFence(content);
  const parsed = JSON.parse(extractJsonObject(normalized)) as { proposedChanges?: unknown[] };
  const proposedChanges = Array.isArray(parsed.proposedChanges) ? parsed.proposedChanges.map((item) => {
    const raw = item as Partial<FitToJdProposedChange>;
    const riskFlags = Array.isArray(raw.riskFlags)
      ? raw.riskFlags.filter((flag): flag is FittedCvRiskFlag => VALID_RISK_FLAGS.includes(flag as FittedCvRiskFlag))
      : [];
    return {
      targetField: String(raw.targetField ?? '').trim(),
      before: String(raw.before ?? ''),
      after: String(raw.after ?? '').trim(),
      rationale: String(raw.rationale ?? '').trim(),
      jdEvidence: raw.jdEvidence ? String(raw.jdEvidence).trim() : undefined,
      riskFlags,
    };
  }).filter((change) => isSupportedTargetField(change.targetField) && change.after && change.rationale) : [];
  return { proposedChanges };
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

const buildProviderError = async (response: Response, includeRateLimitDetails = false) => {
  const providerMessage = await extractProviderErrorMessage(response);
  if (response.status === 429) {
    return includeRateLimitDetails && providerMessage
      ? `AI request limit reached. ${providerMessage}`
      : 'AI request limit reached. Try again later or check your provider quota.';
  }
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
  const content = await requestChatContent(settings, buildAiAssistMessages(request), 0.2);
  const suggestion = parseSuggestion(content);
  if (!suggestion.replacement) throw new Error('AI provider returned an empty suggestion.');
  return suggestion;
};

export const requestReadinessReport = async (
  settings: AiProviderSettings,
  request: ReadinessReportRequest
): Promise<AiReadinessResult> => {
  const content = await requestChatContent(settings, buildReadinessMessages(request), 0.1);
  const report = parseReadinessResult(content);
  if (report.reasons.length === 0) throw new Error('AI provider returned no readiness reasons.');
  return report;
};

const requestChatContent = async (
  settings: AiProviderSettings,
  messages: ChatMessage[],
  temperature: number,
  options: { includeRateLimitDetails?: boolean } = {}
) => {
  if (!isAiConfigured(settings)) throw new Error('AI settings are incomplete.');
  const apiKey = getApiKeyForRequest(settings);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(settings.endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature
    })
  });
  if (!response.ok) {
    throw new Error(await buildProviderError(response, options.includeRateLimitDetails));
  }
  if (settings.provider === 'gemini') {
    const remaining = parseInt(response.headers.get('x-ratelimit-remaining-requests') ?? '', 10);
    const limit = parseInt(response.headers.get('x-ratelimit-limit-requests') ?? '', 10);
    if (!isNaN(remaining) && !isNaN(limit) && limit > 0) {
      storage.saveGeminiQuota({ remaining, limit, updatedAt: new Date().toISOString() });
    }
  }
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI provider returned no content.');
  return content;
};

export const requestProviderConnectionCheck = async (settings: AiProviderSettings): Promise<AiProviderConnectionCheck> => {
  await requestChatContent(settings, [
    {
      role: 'system',
      content: 'You are verifying a FitCV AI provider connection. Reply with the exact text: FitCV connection OK'
    },
    {
      role: 'user',
      content: 'Verify this connection.'
    }
  ], 0, { includeRateLimitDetails: true });
  return {
    checkedAt: new Date().toISOString(),
    model: settings.model.trim(),
    providerLabel: settings.provider ? PROVIDER_PRESETS[settings.provider].label : 'Custom provider'
  };
};

export const requestFitToJdDraft = async (
  settings: AiProviderSettings,
  request: FitToJdRequest
): Promise<FitToJdDraftResult> => {
  const content = await requestChatContent(settings, buildFitToJdMessages(request), 0.2);
  const result = parseFitToJdResult(content);
  if (result.proposedChanges.length === 0) throw new Error('AI provider returned no valid fit-to-JD changes.');
  return result;
};

export const requestJdMatchReport = async (
  settings: AiProviderSettings,
  request: FitToJdRequest
): Promise<AiReadinessResult> => {
  const content = await requestChatContent(settings, buildJdMatchMessages(request), 0.1);
  const report = parseReadinessResult(content);
  if (report.reasons.length === 0) throw new Error('AI provider returned no JD Match reasons.');
  return report;
};

// --- CV import from file ---

export type ImportFromCvRequest = {
  text: string;
  sectionEnvs: SectionEnvDefinition[];
  entryTypes: EntryTypeDefinition[];
};

export const buildImportFromCvMessages = (request: ImportFromCvRequest): ChatMessage[] => {
  const envDescriptions = request.sectionEnvs.map((env) => {
    const allowedEntries = env.allowedEntryTypeIds.map((typeId) => {
      const et = request.entryTypes.find((e) => e.id === typeId);
      if (!et) return `type "${typeId}"`;
      const fields = et.fields.map((f) =>
        f.multiline
          ? `"${f.id}" (${f.label}, multiline — use \\n to separate lines, NOT an array)`
          : `"${f.id}" (${f.label})`
      ).join(', ');
      return `type "${typeId}" (${et.label}) with fields: ${fields}`;
    }).join('; ');
    return `  env "${env.id}" (${env.label}): ${allowedEntries}`;
  }).join('\n');

  const exampleLines: string[] = [];
  outer: for (const env of request.sectionEnvs) {
    for (const typeId of env.allowedEntryTypeIds) {
      const et = request.entryTypes.find((e) => e.id === typeId);
      if (!et || et.fields.length < 2 || !et.fields.some((f) => f.multiline)) continue;
      const exampleFields: Record<string, string> = {};
      for (const f of et.fields) {
        exampleFields[f.id] = f.multiline ? 'First bullet point\nSecond bullet point' : `Example ${f.label}`;
      }
      exampleLines.push(
        `Example entry for env "${env.id}", type "${typeId}" (note: multiline field uses \\n, not an array):`,
        JSON.stringify({ type: typeId, fields: exampleFields }, null, 2),
      );
      break outer;
    }
  }

  return [
    {
      role: 'system',
      content: [
        'You are a CV data extractor.',
        'Extract structured information from the provided CV text and return it as strict JSON.',
        '',
        'EXTRACTION RULES:',
        '1. Copy all values verbatim. Do NOT rephrase, improve, summarise, or modify any text.',
        '2. Names, dates, titles, metrics, and descriptions must appear exactly as in the source.',
        '3. Do not invent information not present in the source.',
        '4. MULTILINE FIELDS (e.g. "highlights", "description"): return as a single \\n-separated string — NOT an array.',
        '5. SECTION MAPPING: map each CV section heading to the closest environment by label. Typical mappings:',
        '     "Work Experience" / "Experience" → environment labelled "Experience"',
        '     "Education" → environment labelled "CV Entries"',
        '     "Projects" → environment labelled "Projects"',
        '     "Skills" / "Technical Skills" → environment labelled "Skills"',
        '     Any other section → use the "cvsubsection" environment if available, otherwise closest match',
        '6. Use only the environment IDs and entry type IDs listed in the vocabulary below.',
        '7. Omit sections and fields absent from the source.',
        '8. Do not wrap the response in markdown fences.',
        '',
        'Return strict JSON with this exact shape:',
        '{ "profile": { "fullName": "", "headline": "", "email": "", "phone": "", "location": "", "linkedin": "", "links": [], "extraInfo": "" },',
        '"summary": "",',
        '"flexSections": [ { "name": "SECTION NAME", "items": [ { "environment": "<env-id>", "items": [ { "type": "<entry-type-id>", "fields": { "<field-id>": "<value>" } } ] } ] } ] }',
        ...(exampleLines.length ? ['', ...exampleLines] : []),
        '',
        'Template vocabulary (use only these IDs):',
        envDescriptions,
        '',
        'Omit sections and fields absent from the source. Do not wrap the response in markdown fences.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `CV text:\n${request.text}`,
    },
  ];
};

const parseImportedContent = (
  raw: unknown,
  sectionEnvs: SectionEnvDefinition[],
  entryTypes: EntryTypeDefinition[]
): ResumeContent => {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = emptyContent();
  base.profileHighlights = undefined;

  if (parsed.profile && typeof parsed.profile === 'object') {
    const p = parsed.profile as Record<string, unknown>;
    base.profile = {
      ...base.profile,
      fullName: typeof p.fullName === 'string' ? p.fullName.trim() : '',
      headline: typeof p.headline === 'string' ? p.headline.trim() : '',
      email: typeof p.email === 'string' ? p.email.trim() : '',
      phone: typeof p.phone === 'string' ? p.phone.trim() : '',
      location: typeof p.location === 'string' ? p.location.trim() : '',
      linkedin: typeof p.linkedin === 'string' ? p.linkedin.trim() : '',
      links: Array.isArray(p.links) ? p.links.map(String).filter(Boolean) : [],
      extraInfo: typeof p.extraInfo === 'string' ? p.extraInfo.trim() : '',
    };
  }

  if (typeof parsed.summary === 'string') {
    base.summary = parsed.summary.trim();
  }

  const validEnvIds = new Set(sectionEnvs.map((e) => e.id));
  const validTypeIds = new Set(entryTypes.map((e) => e.id));

  if (Array.isArray(parsed.flexSections)) {
    base.flexSections = (parsed.flexSections as unknown[])
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object' && typeof (s as Record<string, unknown>).name === 'string'))
      .map((section): FlexSection => {
        const subs: FlexSubSection[] = Array.isArray(section.items)
          ? (section.items as unknown[])
            .filter((sub): sub is Record<string, unknown> => {
              if (!sub || typeof sub !== 'object') return false;
              return validEnvIds.has(String((sub as Record<string, unknown>).environment ?? ''));
            })
            .map((sub): FlexSubSection => {
              const entries: FlexEntry[] = Array.isArray(sub.items)
                ? (sub.items as unknown[])
                  .filter((e): e is Record<string, unknown> => {
                    if (!e || typeof e !== 'object') return false;
                    return validTypeIds.has(String((e as Record<string, unknown>).type ?? ''));
                  })
                  .map((e): FlexEntry => {
                    const rawFields = (e.fields && typeof e.fields === 'object' && !Array.isArray(e.fields))
                      ? e.fields as Record<string, unknown>
                      : {};
                    const fields: Record<string, string> = {};
                    for (const [k, v] of Object.entries(rawFields)) {
                      if (typeof v === 'string') {
                        fields[k] = v;
                      } else if (Array.isArray(v)) {
                        // Coerce arrays (AI often returns multiline fields as arrays despite instructions)
                        fields[k] = v.filter((item) => typeof item === 'string').join('\n');
                      }
                    }
                    return { id: createId('entry'), type: String(e.type), fields };
                  })
                  .filter((e) => Object.values(e.fields).some((v) => typeof v === 'string' && v.trim()))
                : [];
              return { id: createId('sub'), environment: String(sub.environment), items: entries };
            })
          : [];
        return {
          id: createId('section'),
          name: String(section.name).trim(),
          items: subs,
        };
      })
      .filter((s) => s.name);
  }

  return base;
};

export const requestImportFromCv = async (
  settings: AiProviderSettings,
  request: ImportFromCvRequest
): Promise<ResumeContent> => {
  const raw = await requestChatContent(settings, buildImportFromCvMessages(request), 0);
  const normalized = stripMarkdownFence(raw);
  const parsed = JSON.parse(extractJsonObject(normalized)) as unknown;
  return parseImportedContent(parsed, request.sectionEnvs, request.entryTypes);
};
