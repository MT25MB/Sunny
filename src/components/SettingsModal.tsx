import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brain, Check, CircleHelp, Download, Eye, EyeOff, FileText, Gauge,
  Loader2, LockKeyhole, Mic, Monitor, Plug, RefreshCw, RotateCcw,
  ShieldCheck, Trash2, Wifi, X,
} from 'lucide-react';
import {
  type BrainProviderType,
  type ClarificationLevel,
  type ExecutionSpeed,
  type PermissionCategory,
  type PermissionTier,
  type SunnyPreferences,
  defaultPreferences,
} from '@/lib/local-preferences';
import {
  getCredential,
  setCredential,
  deleteCredential,
  testProviderConnection,
  type CredentialKey,
} from '@/lib/credential-store';
import type { ModelStatus } from '@/vite-env';
import type { WindowSizePreset } from '@/types/electron';

type ProviderConfig = {
  value: BrainProviderType;
  label: string;
  detail: string;
  cost: 'Free' | 'Paid' | 'Free (local setup)' | 'Free (limited)',
  offline: boolean;
  badge?: string;
  credentialKey?: CredentialKey;
  defaultModel: string;
  modelOptions: string[];
};

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    value: 'embedded', label: 'Built-in', detail: 'Runs on your computer. No setup needed.',
    cost: 'Free', offline: true, badge: 'Open Source',
    defaultModel: 'moondream2', modelOptions: ['moondream2'],
  },
  {
    value: 'ollama', label: 'Ollama', detail: 'Local AI models via Ollama. Free and private.',
    cost: 'Free (local setup)', offline: true, badge: 'Open Source',
    defaultModel: 'qwen3-vl:8b', modelOptions: ['qwen3-vl:8b', 'gemma4:12b', 'llama3.2-vision'],
  },
  {
    value: 'groq', label: 'Groq', detail: 'Fast cloud inference. Requires API key.',
    cost: 'Free (limited)', offline: false,
    credentialKey: 'groq_api_key',
    defaultModel: 'llama-3.3-70b-versatile', modelOptions: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    value: 'openai', label: 'OpenAI', detail: 'GPT-4o vision. Requires API key.',
    cost: 'Paid', offline: false,
    credentialKey: 'openai_api_key',
    defaultModel: 'gpt-4o', modelOptions: ['gpt-4o', 'gpt-4o-mini'],
  },
  {
    value: 'anthropic', label: 'Anthropic', detail: 'Claude vision. Requires API key.',
    cost: 'Paid', offline: false,
    credentialKey: 'anthropic_api_key',
    defaultModel: 'claude-sonnet-4-20250514', modelOptions: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
  },
];

const speedOptions: { value: ExecutionSpeed; label: string; detail: string }[] = [
  { value: 'careful', label: 'Careful', detail: 'Extra pauses between actions' },
  { value: 'balanced', label: 'Balanced', detail: 'A comfortable everyday pace' },
  { value: 'fast', label: 'Fast', detail: 'For familiar, repeatable tasks' },
];

const clarificationLevelOptions: { value: ClarificationLevel; label: string; detail: string }[] = [
  { value: 'all', label: 'All vague requests', detail: 'Sunny asks for details whenever a request is unclear.' },
  { value: 'destructive-only', label: 'Only risky requests', detail: 'Sunny only asks before destructive or dangerous actions.' },
];

/**
 * The window cannot be resized by dragging its edges, so these presets are
 * the only way to change its size. Each one is computed against the usable
 * area of the display the window is on, so the same choice behaves well on
 * an old panel and on a large monitor.
 */
const WINDOW_SIZE_OPTIONS: { value: WindowSizePreset; label: string; detail: string }[] = [
  { value: 'compact', label: 'Small', detail: 'A little box in the corner' },
  { value: 'comfortable', label: 'Comfortable', detail: 'Fits most screens nicely' },
  { value: 'large', label: 'Large', detail: 'More room for the activity log' },
];

type TestState = 'idle' | 'testing' | 'success' | 'error';
type TestResult = { state: TestState; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  preferences: SunnyPreferences;
  onUpdate: (patch: Partial<SunnyPreferences>) => void;
  onReset: () => void;
  modelStatus: ModelStatus;
  debugLogCount: number;
  onClearLogs: () => void;
  onExportLogs: () => void;
  onInitModel: () => void;
  autoCheckUpdates: boolean;
  onAutoCheckUpdatesChange: (enabled: boolean) => void;
};

export function SettingsModal({
  open, onClose, preferences, onUpdate, onReset,
  modelStatus, debugLogCount, onClearLogs, onExportLogs, onInitModel,
  autoCheckUpdates, onAutoCheckUpdatesChange,
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [apiKeyValues, setApiKeyValues] = useState<Record<CredentialKey, string>>({
    openai_api_key: '',
    anthropic_api_key: '',
    groq_api_key: '',
  });
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<CredentialKey, boolean>>({
    openai_api_key: false,
    anthropic_api_key: false,
    groq_api_key: false,
  });
  const [apiKeySaved, setApiKeySaved] = useState<Record<CredentialKey, boolean>>({
    openai_api_key: false,
    anthropic_api_key: false,
    groq_api_key: false,
  });
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [windowPreset, setWindowPreset] = useState<WindowSizePreset>('comfortable');
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error'>('idle');
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateError, setUpdateError] = useState<string | null>(null);

  const activeConfig = PROVIDER_CONFIGS.find((p) => p.value === preferences.brain_provider) ?? PROVIDER_CONFIGS[0];

  // Load API keys from credential store when modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      const keys: CredentialKey[] = ['openai_api_key', 'anthropic_api_key', 'groq_api_key'];
      const values: Record<CredentialKey, string> = { ...apiKeyValues };
      for (const key of keys) {
        const val = await getCredential(key);
        values[key] = val;
      }
      setApiKeyValues(values);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Read the live window state when the drawer opens so the right preset is
  // marked as selected.
  useEffect(() => {
    if (!open) return;
    void window.windowControls?.getWindowState().then((state) => {
      if (state?.preset) setWindowPreset(state.preset);
    });
  }, [open]);

  const handleWindowPreset = useCallback((preset: WindowSizePreset) => {
    setWindowPreset(preset);
    void window.windowControls?.setWindowPreset(preset);
  }, []);

  const handleResetWindowPosition = useCallback(() => {
    void window.windowControls?.resetWindowPosition();
  }, []);

  // Focus management + Escape to close
  useEffect(() => {
    if (!open) return;
    const firstButton = modalRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    firstButton?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleProviderChange = useCallback((provider: BrainProviderType) => {
    const config = PROVIDER_CONFIGS.find((p) => p.value === provider);
    onUpdate({
      brain_provider: provider,
      brain_model: config?.defaultModel ?? preferences.brain_model,
    });
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1500);
  }, [onUpdate, preferences.brain_model]);

  const handleModelChange = useCallback((model: string) => {
    onUpdate({ brain_model: model });
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1500);
  }, [onUpdate]);

  const handleApiKeyChange = useCallback((key: CredentialKey, value: string) => {
    setApiKeyValues((prev) => ({ ...prev, [key]: value }));
    setApiKeySaved((prev) => ({ ...prev, [key]: false }));
  }, []);

  const handleApiKeySave = useCallback(async (key: CredentialKey) => {
    const value = apiKeyValues[key].trim();
    await setCredential(key, value);
    setApiKeySaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setApiKeySaved((prev) => ({ ...prev, [key]: false })), 2500);
  }, [apiKeyValues]);

  const handleApiKeyRemove = useCallback(async (key: CredentialKey) => {
    await deleteCredential(key);
    setApiKeyValues((prev) => ({ ...prev, [key]: '' }));
    setApiKeySaved((prev) => ({ ...prev, [key]: false }));
  }, []);

  const handleTestConnection = useCallback(async () => {
    const provider = preferences.brain_provider;
    setTestResults((prev) => ({ ...prev, [provider]: { state: 'testing', message: 'Testing...' } }));
    const result = await testProviderConnection(
      provider as 'openai' | 'anthropic' | 'groq' | 'ollama',
      {
        apiKey: activeConfig.credentialKey ? apiKeyValues[activeConfig.credentialKey] : undefined,
        endpoint: provider === 'ollama' ? preferences.ollama_endpoint : undefined,
        model: preferences.brain_model,
      }
    );
    setTestResults((prev) => ({
      ...prev,
      [provider]: { state: result.success ? 'success' : 'error', message: result.message },
    }));
  }, [preferences.brain_provider, preferences.brain_model, preferences.ollama_endpoint, activeConfig.credentialKey, apiKeyValues]);

  // Unified one-click update flow: idle -> checking -> downloading -> ready -> restart
  // Events from the main process drive downloading/ready/up-to-date/error.
  const handleUpdateAction = useCallback(async () => {
    if (updatePhase === 'idle' || updatePhase === 'up-to-date' || updatePhase === 'error') {
      // Start a fresh check
      setUpdatePhase('checking');
      setUpdateError(null);
      setUpdateVersion('');
      try {
        if (!window.electronAPI?.checkForUpdates) {
          throw new Error('Update check not available');
        }
        // The result doesn't reliably tell us if an update exists;
        // the main process events (update-available / update-not-available) do.
        await window.electronAPI.checkForUpdates();
      } catch (err) {
        console.error('Update check failed:', err);
        const message = err instanceof Error ? err.message : 'Failed to check for updates. Please try again.';
        setUpdateError(message);
        setUpdatePhase('error');
      }
    } else if (updatePhase === 'ready') {
      // User confirmed restart — install and quit
      try {
        await window.electronAPI?.quitAndInstall?.();
      } catch (err) {
        console.error('Failed to quit and install:', err);
      }
    }
    // 'checking' and 'downloading' are non-interactive — the button just shows progress
  }, [updatePhase]);

  // Subscribe to updater events to drive the phase automatically
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubAvailable = window.electronAPI.onUpdateAvailable?.((info) => {
      setUpdateVersion(info.version || '');
      setUpdatePhase('downloading');
      // Auto-download immediately when an update is available
      void window.electronAPI.downloadUpdate?.();
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded?.((info) => {
      setUpdateVersion(info.version || '');
      setUpdatePhase('ready');
    });

    const unsubNotAvailable = window.electronAPI.onUpdateNotAvailable?.(() => {
      setUpdatePhase('up-to-date');
    });

    const unsubError = window.electronAPI.onUpdateError?.((message) => {
      console.warn('[Sunny] Update error:', message);
      setUpdateError(message);
      setUpdatePhase('error');
    });

    return () => {
      unsubAvailable?.();
      unsubDownloaded?.();
      unsubNotAvailable?.();
      unsubError?.();
    };
  }, []);

  if (!open) return null;

  const currentTest = testResults[preferences.brain_provider] ?? { state: 'idle' as TestState, message: '' };

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div
        className="settings-modal"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Sunny settings"
        aria-modal="true"
      >
        <div className="settings-modal-header">
          <div>
            <p className="panel-kicker">Sunny settings</p>
            <h2>Make Sunny feel right</h2>
          </div>
          <button type="button" className="icon-button" data-autofocus onClick={onClose} aria-label="Close settings">
            <X size={19} />
          </button>
        </div>

        <div className="settings-modal-body">
          {/* AI Model Section */}
          <section className="settings-section">
            <div className="settings-section-title">
              <Brain size={18} />
              <span><strong>AI Model</strong><small>Choose how Sunny thinks. Built-in and Ollama work offline for free.</small></span>
            </div>
            <div className="provider-grid">
              {PROVIDER_CONFIGS.map((config) => (
                <button
                  key={config.value}
                  className={`provider-card ${preferences.brain_provider === config.value ? 'selected' : ''}`}
                  onClick={() => handleProviderChange(config.value)}
                  aria-pressed={preferences.brain_provider === config.value}
                >
                  <div className="provider-card-header">
                    <span className="provider-card-label">{config.label}</span>
                    {config.offline && <span className="provider-badge offline">Offline</span>}
                    {config.badge && <span className="provider-badge open-source">{config.badge}</span>}
                  </div>
                  <small className="provider-card-detail">{config.detail}</small>
                  <span className={`provider-cost cost-${config.cost.includes('Free') ? 'free' : 'paid'}`}>
                    {config.cost}
                  </span>
                  {preferences.brain_provider === config.value && (
                    <span className="provider-check"><Check size={14} /></span>
                  )}
                </button>
              ))}
            </div>

            {/* Model selection */}
            {activeConfig.modelOptions.length > 1 && (
              <div className="model-select-row">
                <label htmlFor="model-select">Model</label>
                <select
                  id="model-select"
                  value={preferences.brain_model}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="settings-select"
                >
                  {activeConfig.modelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Embedded model status */}
            {preferences.brain_provider === 'embedded' && (
              <div className="model-status-row">
                <span className={`model-status-dot model-status-${modelStatus.status}`} />
                <span>{modelStatus.message || 'Model not loaded yet.'}</span>
                {modelStatus.status !== 'ready' && (
                  <button className="secondary-button" onClick={onInitModel}>
                    <Download size={14} /> Load
                  </button>
                )}
              </div>
            )}

            {/* Ollama endpoint config */}
            {preferences.brain_provider === 'ollama' && (
              <div className="ollama-endpoint-row">
                <label htmlFor="ollama-endpoint">Ollama endpoint</label>
                <input
                  id="ollama-endpoint"
                  type="text"
                  className="api-key-input"
                  placeholder="http://localhost:11434"
                  value={preferences.ollama_endpoint}
                  onChange={(e) => onUpdate({ ollama_endpoint: e.target.value })}
                />
                <small className="endpoint-hint">Default is http://localhost:11434. Change if Ollama runs elsewhere.</small>
              </div>
            )}

            {/* API key for cloud providers */}
            {activeConfig.credentialKey && (
              <div className="api-key-section">
                <label htmlFor="api-key-input">API key (stored locally, encrypted by your OS)</label>
                <div className="api-key-input-wrap">
                  <input
                    id="api-key-input"
                    type={apiKeyVisible[activeConfig.credentialKey] ? 'text' : 'password'}
                    className="api-key-input"
                    placeholder="Enter your API key..."
                    value={apiKeyValues[activeConfig.credentialKey]}
                    onChange={(e) => handleApiKeyChange(activeConfig.credentialKey!, e.target.value)}
                  />
                  <button
                    className="api-key-toggle"
                    onClick={() => setApiKeyVisible((prev) => ({ ...prev, [activeConfig.credentialKey!]: !prev[activeConfig.credentialKey!] }))}
                    aria-label={apiKeyVisible[activeConfig.credentialKey] ? 'Hide API key' : 'Show API key'}
                  >
                    {apiKeyVisible[activeConfig.credentialKey] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="api-key-actions">
                  <button
                    className="secondary-button api-key-save-btn"
                    onClick={() => handleApiKeySave(activeConfig.credentialKey!)}
                    disabled={!apiKeyValues[activeConfig.credentialKey].trim()}
                  >
                    <LockKeyhole size={13} /> Save key
                  </button>
                  {apiKeyValues[activeConfig.credentialKey].trim() && (
                    <button
                      className="secondary-button api-key-remove-btn"
                      onClick={() => handleApiKeyRemove(activeConfig.credentialKey!)}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                  {apiKeySaved[activeConfig.credentialKey] && (
                    <span className="key-saved-badge"><Check size={12} /> Saved locally</span>
                  )}
                </div>
              </div>
            )}

            {/* Test connection button - shown for every provider */}
            <div className="test-connection-row">
              <button
                className={`test-connection-btn ${currentTest.state === 'testing' ? 'testing' : currentTest.state === 'success' ? 'success' : currentTest.state === 'error' ? 'error' : ''}`}
                onClick={handleTestConnection}
                disabled={currentTest.state === 'testing'}
              >
                {currentTest.state === 'testing' ? <Loader2 size={14} className="spin" /> : <Plug size={14} />}
                Test connection
              </button>
              {currentTest.state !== 'idle' && currentTest.state !== 'testing' && (
                <span className={`test-result test-${currentTest.state}`}>
                  {currentTest.state === 'success' ? <Check size={13} /> : <X size={13} />}
                  {currentTest.message}
                </span>
              )}
            </div>
          </section>

          {/* Clarification Level */}
          <section className="settings-section">
            <div className="settings-section-title">
              <CircleHelp size={18} />
              <span><strong>Clarification level</strong><small>When should Sunny ask for more details?</small></span>
            </div>
            <div className="speed-options">
              {clarificationLevelOptions.map((option) => (
                <button
                  className={`speed-option ${preferences.clarification_level === option.value ? 'selected' : ''}`}
                  key={option.value}
                  onClick={() => onUpdate({ clarification_level: option.value })}
                >
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                  {preferences.clarification_level === option.value && <Check size={16} />}
                </button>
              ))}
            </div>
          </section>

          {/* Execution Speed */}
          <section className="settings-section">
            <div className="settings-section-title">
              <Gauge size={18} />
              <span><strong>Execution speed</strong><small>Slower is safer for unfamiliar screens.</small></span>
            </div>
            <div className="speed-options">
              {speedOptions.map((option) => (
                <button
                  className={`speed-option ${preferences.execution_speed === option.value ? 'selected' : ''}`}
                  key={option.value}
                  onClick={() => onUpdate({ execution_speed: option.value })}
                >
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                  {preferences.execution_speed === option.value && <Check size={16} />}
                </button>
              ))}
            </div>
          </section>

          {/* Window size and placement */}
          <section className="settings-section">
            <div className="settings-section-title">
              <Monitor size={18} />
              <span><strong>Window size</strong><small>Sunny opens in the bottom right. Pick how big it should be.</small></span>
            </div>
            <div className="speed-options">
              {WINDOW_SIZE_OPTIONS.map((option) => (
                <button
                  className={`speed-option ${windowPreset === option.value ? 'selected' : ''}`}
                  key={option.value}
                  onClick={() => handleWindowPreset(option.value)}
                >
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                  {windowPreset === option.value && <Check size={16} />}
                </button>
              ))}
            </div>
            <button className="toggle-row" onClick={handleResetWindowPosition}>
              <span>Move the window back to the bottom right</span>
            </button>
            <button
              className={`toggle-row ${preferences.remember_window_position ? 'enabled' : ''}`}
              onClick={() => onUpdate({ remember_window_position: !preferences.remember_window_position })}
            >
              <span>Remember the window size and position</span>
              <span className="toggle"><span /></span>
            </button>
          </section>

          {/* Safety Confirmations */}
          <section className="settings-section">
            <div className="settings-section-title">
              <ShieldCheck size={18} />
              <span><strong>Safety confirmations</strong><small>Ask before sending, deleting, buying, or submitting.</small></span>
            </div>
            <button
              className={`toggle-row ${preferences.require_sensitive_confirmation ? 'enabled' : ''}`}
              onClick={() => onUpdate({ require_sensitive_confirmation: !preferences.require_sensitive_confirmation })}
            >
              <span>{preferences.require_sensitive_confirmation ? 'Sensitive actions need approval' : 'Sensitive actions run automatically'}</span>
              <span className="toggle"><span /></span>
            </button>
            {!preferences.require_sensitive_confirmation && (
              <p className="settings-warning" role="alert">
                Sunny will act without asking first. That includes deleting files, sending
                messages, and making purchases on the websites you have open. Turn this
                back on unless you are confident about every task you give it.
              </p>
            )}
          </section>

          {/* Computer control */}
          <section className="settings-section">
            <div className="settings-section-title">
              <Monitor size={18} />
              <span><strong>Computer control</strong><small>Let Sunny use your mouse and keyboard to do multi-step jobs.</small></span>
            </div>
            <button
              className={`toggle-row ${preferences.computer_control ? 'enabled' : ''}`}
              onClick={() => onUpdate({ computer_control: !preferences.computer_control })}
            >
              <span>{preferences.computer_control ? 'Computer control is on' : 'Computer control is off'}</span>
              <span className="toggle"><span /></span>
            </button>
            {preferences.computer_control ? (
              <div className="permission-tiers">
                {(
                  [
                    ['mouse', 'Mouse and keyboard'],
                    ['files', 'Change files'],
                    ['system', 'System settings'],
                    ['open', 'Open apps and sites'],
                    ['screen', 'Look at the screen'],
                    ['terminal', 'Terminal commands'],
                  ] as Array<[PermissionCategory, string]>
                ).map(([category, label]) => {
                  const tiers = { ...defaultPreferences.permission_tiers, ...preferences.permission_tiers };
                  const current: PermissionTier = tiers[category] ?? 'ask';
                  return (
                    <div className="permission-tier-row" key={category}>
                      <span>{label}</span>
                      <div className="permission-tier-options" role="group" aria-label={`${label} permission`}>
                        {(['off', 'ask', 'always'] as PermissionTier[]).map((tier) => (
                          <button
                            key={tier}
                            type="button"
                            className={`permission-tier ${current === tier ? 'selected' : ''}`}
                            aria-pressed={current === tier}
                            onClick={() => onUpdate({ permission_tiers: { ...tiers, [category]: tier } })}
                          >
                            {tier === 'off' ? 'Never' : tier === 'ask' ? 'Ask' : 'Always'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="settings-warning" role="alert">
                Sunny will answer questions but will not do jobs on the computer.
              </p>
            )}
          </section>

          {/* Privacy */}
          <section className="settings-section">
            <div className="settings-section-title">
              <LockKeyhole size={18} />
              <span><strong>Local-only screen understanding</strong><small>Keep captured screens on this computer.</small></span>
            </div>
            <button
              className={`toggle-row ${preferences.local_only ? 'enabled' : ''}`}
              onClick={() => onUpdate({ local_only: !preferences.local_only })}
            >
              <span>{preferences.local_only ? 'Local mode is on' : 'Cloud fallback is allowed'}</span>
              <span className="toggle"><span /></span>
            </button>
          </section>

          {/* Voice Input */}
          <section className="settings-section">
            <div className="settings-section-title">
              <Mic size={18} />
              <span><strong>Voice input</strong><small>Use your microphone to speak requests.</small></span>
            </div>
            <button
              className={`toggle-row ${preferences.voice_enabled ? 'enabled' : ''}`}
              onClick={() => onUpdate({ voice_enabled: !preferences.voice_enabled })}
            >
              <span>{preferences.voice_enabled ? 'Voice input is on' : 'Voice input is off'}</span>
              <span className="toggle"><span /></span>
            </button>
          </section>

          {/* Privacy & Logs */}
          <section className="settings-section">
            <div className="settings-section-title">
              <FileText size={18} />
              <span><strong>Privacy and logs</strong><small>All logs are stored locally on this computer. Nothing is sent to the cloud.</small></span>
            </div>
            <div className="log-controls">
              <span className="log-count">{debugLogCount} debug log {debugLogCount === 1 ? 'entry' : 'entries'} stored locally</span>
              <div className="log-buttons">
                <button className="secondary-button" onClick={onExportLogs}><FileText size={14} /> Export</button>
                <button className="secondary-button" onClick={onClearLogs}><Trash2 size={14} /> Clear logs</button>
              </div>
            </div>
          </section>

          {/* Updates */}
          <section className="settings-section">
            <div className="settings-section-title">
              <RefreshCw size={18} />
              <span><strong>Updates</strong><small>Keep Sunny current with the latest features and fixes.</small></span>
            </div>
            <div className="update-controls">
              <button
                className="update-check-button"
                onClick={handleUpdateAction}
                disabled={updatePhase === 'checking' || updatePhase === 'downloading'}
                aria-busy={updatePhase === 'checking' || updatePhase === 'downloading'}
              >
                {updatePhase === 'checking' ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    Checking…
                  </>
                ) : updatePhase === 'downloading' ? (
                  <>
                    <RotateCcw size={14} className="spin" />
                    Downloading…
                  </>
                ) : updatePhase === 'ready' ? (
                  <>
                    <RotateCcw size={14} /> Restart now
                  </>
                ) : updatePhase === 'up-to-date' ? (
                  <>
                    <Check size={14} /> Up to date
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} /> Check for updates
                  </>
                )}
              </button>
              {updateVersion && updatePhase !== 'idle' && updatePhase !== 'ready' && (
                <span className="update-version">Version {updateVersion}</span>
              )}
              {updatePhase === 'error' && (
                <span className="update-error">{updateError || 'Failed to check for updates. Please try again.'}</span>
              )}
              {updatePhase === 'up-to-date' && (
                <span className="update-success">You&rsquo;re up to date</span>
              )}
              <div className="toggle-row {autoCheckUpdates ? 'enabled' : ''}">
                <span>Automatically check for updates</span>
                <span className="toggle" onClick={() => onAutoCheckUpdatesChange(!autoCheckUpdates)}>
                  <span />
                </span>
              </div>
            </div>
          </section>

          {/* Open Source Info Banner */}
          <div className="oss-info-banner">
            <Wifi size={16} />
            <p>Built-in and Ollama models run entirely on your computer -- no internet, no API keys, no cloud. <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">Install Ollama</a> to use local vision models.</p>
          </div>
        </div>

        <div className="settings-modal-footer">
          <span className="save-indicator">
            {saveState === 'saved' ? <><Check size={13} /> Preferences saved locally</> : 'All settings stay on this device'}
          </span>
          <button className="secondary-button" onClick={onReset}><RotateCcw size={15} /> Reset</button>
        </div>
      </div>
    </div>
  );
}
