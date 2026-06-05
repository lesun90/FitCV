import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { storage } from '../services/storage';
import {
  getSessionApiKey,
  isAiConfigured,
  PROVIDER_PRESETS,
  requestAiSuggestion,
  setSessionApiKey,
  type AiAssistAction,
  type AiAssistSuggestion,
  type AiProvider,
  type AiProviderSettings,
  type AiRewriteStyle
} from '../services/aiProvider';

type TextSelection = {
  start: number;
  end: number;
};

type AssistAnchorPosition = {
  x: number;
  y: number;
};

type AssistStage = 'menu' | 'setup' | 'settings' | 'disclosure' | 'loading' | 'review' | 'error';

const rewriteStyles: { value: AiRewriteStyle; label: string }[] = [
  { value: 'impact-focused', label: 'Impact-focused' },
  { value: 'ats-friendly', label: 'ATS-friendly' },
  { value: 'executive', label: 'Executive' },
  { value: 'technical', label: 'Technical' },
  { value: 'plain-language', label: 'Plain language' },
];

const actionLabels: Record<AiAssistAction, string> = {
  rephrase: 'Rephrasing',
  shorten: 'Shortening',
  rewrite: 'Rewriting'
};

const now = () => new Date().toISOString();

const blankSettings = (): AiProviderSettings => ({
  id: 'default',
  schemaVersion: 1,
  endpointUrl: '',
  model: '',
  rememberApiKey: false,
  createdAt: now(),
  updatedAt: now()
});

let cachedSettings: AiProviderSettings | undefined;

const sanitizeSettings = (settings: AiProviderSettings, apiKey: string): AiProviderSettings => {
  const base = {
    ...settings,
    endpointUrl: settings.endpointUrl.trim(),
    model: settings.model.trim(),
    updatedAt: now()
  };
  if (settings.rememberApiKey && apiKey) return { ...base, apiKey };
  const { apiKey: _apiKey, ...withoutKey } = base;
  return withoutKey;
};

const loadSettings = async () => cachedSettings ?? (await storage.getProviderSettings()) ?? blankSettings();

export const AiSettingsButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="chrome-button" type="button" onClick={() => setOpen(true)} aria-label="AI settings"><Bot />AI</button>
      {open && <AiSettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
};

export const AiAssistButton = ({
  anchorPosition,
  disabled,
  fieldLabel,
  getSelection,
  getValue,
  onApply,
  selectionActive = true,
  surroundingText,
  value
}: {
  anchorPosition?: AssistAnchorPosition;
  disabled?: boolean;
  fieldLabel: string;
  getSelection?: () => TextSelection;
  getValue?: () => string;
  onApply: (value: string, selection?: TextSelection) => void;
  selectionActive?: boolean;
  surroundingText?: string;
  value: string;
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverAbove, setPopoverAbove] = useState(false);
  const [settings, setSettings] = useState<AiProviderSettings>();
  const [stage, setStage] = useState<AssistStage>('menu');
  const [pendingAction, setPendingAction] = useState<AiAssistAction>('rephrase');
  const [pendingStyle, setPendingStyle] = useState<AiRewriteStyle>();
  const [userInstruction, setUserInstruction] = useState('');
  const [selection, setSelection] = useState<TextSelection>();
  const [suggestion, setSuggestion] = useState<AiAssistSuggestion>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPopoverAbove(window.innerHeight - rect.bottom < 320);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadSettings().then((loaded) => {
      setSettings(loaded);
      setStage(isAiConfigured(loaded) ? 'menu' : 'setup');
      setError('');
      setSuggestion(undefined);
    });
  }, [open]);

  const selectedText = () => {
    const currentValue = getValue?.() ?? value;
    const current = selection ?? getSelection?.();
    if (!current || current.start === current.end) return currentValue;
    return currentValue.slice(current.start, current.end);
  };

  const beginAction = (action: AiAssistAction, rewriteStyle?: AiRewriteStyle, instruction = '') => {
    const current = getSelection?.();
    setSelection(current);
    setPendingAction(action);
    setPendingStyle(rewriteStyle);
    setUserInstruction(instruction);
    setStage('disclosure');
  };

  const send = async () => {
    if (!settings) return;
    try {
      setStage('loading');
      setSuggestion(await requestAiSuggestion(settings, {
        action: pendingAction,
        rewriteStyle: pendingStyle,
        fieldLabel,
        text: selectedText(),
        surroundingText,
        userInstruction
      }));
      setStage('review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI request failed.');
      setStage('error');
    }
  };

  const accept = () => {
    if (!suggestion) return;
    const current = selection ?? getSelection?.();
    const currentValue = getValue?.() ?? value;
    if (!current || current.start === current.end) {
      onApply(suggestion.replacement);
    } else {
      onApply(currentValue.slice(0, current.start) + suggestion.replacement + currentValue.slice(current.end), current);
    }
    setOpen(false);
  };

  if (!selectionActive && !open) return null;

  return (
    <span
      ref={anchorRef}
      className={anchorPosition ? 'ai-assist-anchor positioned' : 'ai-assist-anchor'}
      style={anchorPosition ? { left: anchorPosition.x, top: anchorPosition.y } : undefined}
    >
      <button
        className="ai-assist-trigger"
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label={`AI assist ${fieldLabel}`}
        title={`AI assist ${fieldLabel}`}
      ><Bot /></button>
      {open && (
        <div className={`ai-popover${popoverAbove ? ' ai-popover--above' : ''}`} role="dialog" aria-label={`AI assist for ${fieldLabel}`}>
          <button className="ai-close" type="button" onClick={() => setOpen(false)} aria-label="Close AI assist"><X /></button>
          {stage === 'setup' && (
            <div className="ai-popover-section">
              <strong>AI setup required</strong>
              <p>Add your endpoint, model, and API key if your provider requires one.</p>
              <button className="ai-primary" type="button" onClick={() => setStage('settings')}>Set up AI</button>
            </div>
          )}
          {stage === 'settings' && (
            <AiSettingsDialog compact onClose={() => setStage('menu')} onSaved={(saved) => { setSettings(saved); setStage(isAiConfigured(saved) ? 'menu' : 'setup'); }} />
          )}
          {stage === 'menu' && (
            <div className="ai-popover-section">
              <strong>CV suggestions</strong>
              <div className="ai-quick-actions">
                <button type="button" onClick={() => beginAction('rephrase')}>Rephrase</button>
                <button type="button" onClick={() => beginAction('shorten')}>Shorten</button>
              </div>
              <div className="ai-rewrite-group">
                <span>Rewrite as</span>
                <div className="ai-rewrite-pills">
                  {rewriteStyles.map((style) => (
                    <button key={style.value} className="ai-rewrite-pill" type="button" onClick={() => beginAction('rewrite', style.value)}>{style.label}</button>
                  ))}
                </div>
                <button className="ai-ghost-btn" type="button" onClick={() => beginAction('rewrite')}>Custom prompt…</button>
              </div>
            </div>
          )}
          {stage === 'disclosure' && (
            <div className="ai-popover-section">
              <strong>Review request</strong>
              <p>This sends the selected {fieldLabel} text to your configured provider. Suggestions require review before applying.</p>
              {pendingAction === 'rewrite' && !pendingStyle && (
                <label className="ai-instruction">
                  <span>Rewrite instruction</span>
                  <textarea
                    aria-label="Rewrite instruction"
                    placeholder="Example: make this sound more senior but keep it concise"
                    value={userInstruction}
                    onChange={(e) => setUserInstruction(e.target.value)}
                  />
                </label>
              )}
              <code>{selectedText().slice(0, 180)}</code>
              <div className="ai-review-actions">
                <button className="ai-primary" type="button" onClick={() => void send()}>Send to provider</button>
                <button type="button" onClick={() => setStage('menu')}>Back</button>
              </div>
            </div>
          )}
          {stage === 'loading' && (
            <div className="ai-popover-section ai-loading">
              <div className="ai-loading-orb" aria-hidden="true">
                <Loader2 className="ai-spin" />
              </div>
              <div className="ai-loading-copy">
                <strong>{actionLabels[pendingAction]} your {fieldLabel.toLowerCase()}</strong>
                <p>Looking for sharper wording while keeping your meaning intact.</p>
              </div>
              <div className="ai-loading-steps" aria-label="Suggestion progress">
                <span><CheckCircle2 aria-hidden="true" /> Reading selection</span>
                <span><Loader2 className="ai-spin" aria-hidden="true" /> Drafting suggestion</span>
                <span><Sparkles aria-hidden="true" /> Waiting for your review</span>
              </div>
            </div>
          )}
          {stage === 'error' && (
            <div className="ai-popover-section">
              <div className="ai-error-body">
                <AlertCircle aria-hidden="true" />
                <div>
                  <strong>Request failed</strong>
                  <p>{error}</p>
                </div>
              </div>
              <div className="ai-review-actions">
                <button type="button" onClick={() => void send()}>Retry</button>
                <button type="button" onClick={() => setStage('menu')}>Back to menu</button>
              </div>
            </div>
          )}
          {stage === 'review' && suggestion && (
            <div className="ai-popover-section ai-review">
              <div className="ai-review-head">
                <div>
                  <strong>Review suggestion</strong>
                  <p>Edit anything before accepting. Your document changes only when you choose Accept.</p>
                </div>
                <Sparkles aria-hidden="true" />
              </div>
              <div className="ai-suggestion-compare">
                <div className="ai-suggestion-card">
                  <small>Original</small>
                  <code>{selectedText()}</code>
                </div>
                <div className="ai-suggestion-card suggested">
                  <small>Suggested draft</small>
                  <textarea aria-label="Suggested text" value={suggestion.replacement} onChange={(e) => setSuggestion({ ...suggestion, replacement: e.target.value })} />
                </div>
              </div>
              {suggestion.rationale && <p className="ai-rationale">{suggestion.rationale}</p>}
              {suggestion.warning && <p className="ai-warning">{suggestion.warning}</p>}
              <div className="ai-review-actions">
                <button className="ai-primary" type="button" aria-label="Accept suggestion" onClick={accept}>Accept suggestion</button>
                <button type="button" onClick={() => setStage('menu')}>New suggestion</button>
                <button type="button" onClick={() => setOpen(false)}>Dismiss</button>
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
};

const PROVIDER_ORDER: AiProvider[] = ['openai', 'deepseek', 'gemini', 'claude', 'local'];

const AiSettingsDialog = ({ compact = false, onClose, onSaved }: {
  compact?: boolean;
  onClose: () => void;
  onSaved?: (settings: AiProviderSettings) => void;
}) => {
  const [settings, setSettings] = useState<AiProviderSettings>(blankSettings);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    void loadSettings().then((loadedSettings) => {
      setSettings(loadedSettings);
      setApiKey('');
    });
  }, []);

  const selectProvider = (p: AiProvider) => {
    const preset = PROVIDER_PRESETS[p];
    setSettings((cur) => ({
      ...cur,
      provider: p,
      endpointUrl: preset.endpointUrl,
      model: preset.defaultModel,
    }));
  };

  const save = async () => {
    const saved = sanitizeSettings(settings, apiKey || settings.apiKey || '');
    if (!saved.rememberApiKey) setSessionApiKey(apiKey || getSessionApiKey());
    cachedSettings = saved;
    await storage.saveProviderSettings(saved);
    onSaved?.(saved);
    onClose();
  };

  const forgetKey = async () => {
    await storage.clearRememberedProviderApiKey();
    setSettings((current) => {
      const { apiKey: _apiKey, ...withoutKey } = current;
      const cleared = { ...withoutKey, rememberApiKey: false };
      cachedSettings = cleared;
      return cleared;
    });
    setApiKey('');
  };

  const activePreset = settings.provider ? PROVIDER_PRESETS[settings.provider] : undefined;

  return (
    <div className={compact ? 'ai-settings compact' : 'ai-settings'} role="dialog" aria-label="AI settings">
      <div className="ai-settings-head">
        <strong>AI settings</strong>
        <button className="ai-close" type="button" onClick={onClose} aria-label="Close AI settings"><X /></button>
      </div>
      <div>
        <div className="ai-provider-selector" role="group" aria-label="Provider">
          {PROVIDER_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              className={`ai-provider-btn${settings.provider === p ? ' selected' : ''}`}
              onClick={() => selectProvider(p)}
            >
              {PROVIDER_PRESETS[p].label}
            </button>
          ))}
        </div>
      </div>
      {activePreset?.corsNote && (
        <p className="ai-cors-note">{activePreset.corsNote}</p>
      )}
      <label>
        <span>Endpoint URL</span>
        <input aria-label="Endpoint URL" value={settings.endpointUrl} placeholder="https://your-provider.example/v1/chat/completions"
          onChange={(e) => setSettings({ ...settings, endpointUrl: e.target.value })} />
      </label>
      <label>
        <span>Model</span>
        <input aria-label="Model" value={settings.model} placeholder={activePreset?.defaultModel ?? 'your-model-name'}
          onChange={(e) => setSettings({ ...settings, model: e.target.value })} />
      </label>
      <label>
        <span>API key{activePreset?.apiKeyUrl && (
          <> — <a className="ai-apikey-link" href={activePreset.apiKeyUrl} target="_blank" rel="noopener noreferrer">Get key ↗</a></>
        )}</span>
        <input aria-label="API key" type="password" value={apiKey} placeholder={settings.apiKey ? 'Saved key is remembered' : settings.provider === 'local' ? 'Not required for local endpoints' : 'Paste your API key'}
          onChange={(e) => setApiKey(e.target.value)} />
      </label>
      <label className="ai-checkbox">
        <input aria-label="Remember API key on this device" type="checkbox" checked={settings.rememberApiKey}
          onChange={(e) => setSettings({ ...settings, rememberApiKey: e.target.checked })} />
        <span>Remember API key on this device</span>
      </label>
      <p className="ai-helper">Stored only in this browser when checked. Never exported in FitCV backups.</p>
      <div className="ai-settings-actions">
        <button className="ai-primary" type="button" aria-label="Save AI settings" onClick={() => void save()}>Save</button>
        {settings.apiKey && <button type="button" onClick={() => void forgetKey()}>Forget key</button>}
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};
