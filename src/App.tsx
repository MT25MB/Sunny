import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  Brain,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  Gauge,
  Globe2,
  Keyboard,
  LockKeyhole,
  Menu,
  Mic,
  MousePointer2,
  RotateCcw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  defaultPreferences,
  loadLocalPreferences as loadPreferences,
  loadLocalTaskLogs as loadRecentSummaryLogs,
  saveLocalPreferences as savePreferences,
  saveLocalTaskLog as saveSummaryLog,
  resetLocalPreferences,
  type BrainProviderType,
  type ExecutionSpeed,
  type SunnyPreferences,
  type TaskLog,
  type TaskOutcome,
} from '@/lib/local-preferences';
import { SettingsModal } from '@/components/SettingsModal';
import { OnboardingScreen } from '@/components/OnboardingScreen';
import {
  classifyActions,
  formatActionForDisplay,
  type DesktopAction,
  type SafetyLevel,
} from '@/lib/desktop-actions';
import {
  generateClarifications,
  needsClarification,
  type ClarificationQuestion,
} from '@/lib/agent-protocol';
import { createBrain } from '@/lib/agent-brain';
import { runAgentLoop, type LoopEvent } from '@/lib/agent-loop';
import mascot from '/assets/mascot.png';
import type { SunnySpeechRecognition, ModelStatus } from '@/vite-env';

type Mode = 'ready' | 'listening' | 'model-loading' | 'clarifying' | 'planning' | 'approval' | 'running' | 'completed' | 'stopped';

type DestructiveCategory = 'delete' | 'close-unsaved' | 'send' | 'purchase' | 'overwrite' | 'system';
type DestructiveDetail = { category: DestructiveCategory; label: string; reason: string };
type PendingAction = { description: string; safety: SafetyLevel; destructive: DestructiveDetail | null };

type LiveAction = {
  description: string;
  safety: SafetyLevel;
  status: 'pending' | 'executing' | 'done' | 'failed';
};

const quickTasks = [
  { label: 'Find a recipe', request: 'Find an easy pasta recipe', icon: Globe2 },
  { label: 'Read my email', request: 'Open my email and show me anything important', icon: Keyboard },
  { label: 'Check weather', request: "Check today's weather", icon: Sparkles },
];

const speedOptions: { value: ExecutionSpeed; label: string; detail: string }[] = [
  { value: 'careful', label: 'Careful', detail: 'Extra pauses between actions' },
  { value: 'balanced', label: 'Balanced', detail: 'A comfortable everyday pace' },
  { value: 'fast', label: 'Fast', detail: 'For familiar, repeatable tasks' },
];

const providerLabels: { value: BrainProviderType; label: string }[] = [
  { value: 'embedded', label: 'Built-in' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'groq', label: 'Groq' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const DESTRUCTIVE_PATTERNS: { test: RegExp; category: DestructiveCategory; label: string; reason: string }[] = [
  { test: /\b(delete|remove|trash|erase|wipe)\b/i, category: 'delete', label: 'Delete or remove files', reason: 'Deleted items may not be recoverable.' },
  { test: /\b(close|quit|exit)\b.*\b(unsaved|without saving|discard)\b/i, category: 'close-unsaved', label: 'Close unsaved windows', reason: 'You could lose work that has not been saved.' },
  { test: /\b(send|email|message|post|publish|reply|forward)\b/i, category: 'send', label: 'Send or publish content', reason: 'Sent messages cannot be un-sent.' },
  { test: /\b(buy|purchase|pay|checkout|order|subscribe)\b/i, category: 'purchase', label: 'Make a purchase or payment', reason: 'Money may be spent or subscriptions started.' },
  { test: /\b(overwrite|replace|rename|move)\b/i, category: 'overwrite', label: 'Overwrite or replace existing content', reason: 'The previous version could be lost permanently.' },
  { test: /\b(settings|config|preferences|permissions|install|uninstall)\b/i, category: 'system', label: 'Change system or app settings', reason: 'System changes can affect other apps or accounts.' },
];

const DESTRUCTIVE_ICONS: Record<DestructiveCategory, typeof Trash2> = {
  delete: Trash2,
  'close-unsaved': AlertOctagon,
  send: ArrowUpRight,
  purchase: Zap,
  overwrite: AlertOctagon,
  system: ShieldAlert,
};

function getDestructiveDetails(request: string): DestructiveDetail[] {
  return DESTRUCTIVE_PATTERNS
    .filter((p) => p.test.test(request))
    .map((p) => ({ category: p.category, label: p.label, reason: p.reason }));
}

function actionsToPendingActions(actions: DesktopAction[]): PendingAction[] {
  return actions.map((action) => {
    const { hasDestructive } = classifyActions([action]);
    const details = getDestructiveDetails(formatActionForDisplay(action));
    return {
      description: formatActionForDisplay(action),
      safety: hasDestructive ? 'destructive' : 'moderate' as SafetyLevel,
      destructive: details.length > 0 ? details[0] : null,
    };
  });
}

function App() {
  const [mode, setMode] = useState<Mode>('ready');
  const [request, setRequest] = useState('');
  const [plannedRequest, setPlannedRequest] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<SunnyPreferences>(defaultPreferences);
  const [taskError, setTaskError] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [confirmReason, setConfirmReason] = useState('');
  const [clarification, setClarification] = useState<ClarificationQuestion | null>(null);
  const [liveActions, setLiveActions] = useState<LiveAction[]>([]);
  const [injectionWarning, setInjectionWarning] = useState<{ patterns: string[]; severity: string } | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ status: 'not-downloaded', progress: 0, message: '' });
  const [recentLogs, setRecentLogs] = useState<TaskLog[]>([]);
  const [debugLogCount, setDebugLogCount] = useState(0);
  const [showModelOverlay, setShowModelOverlay] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const recognitionRef = useRef<SunnySpeechRecognition | null>(null);
  const timersRef = useRef<number[]>([]);
  const cancellationTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const removeProgressListenerRef = useRef<(() => void) | null>(null);

  const isBusy = mode === 'planning' || mode === 'running' || mode === 'clarifying';
  const canEmergencyStop = mode === 'planning' || mode === 'running' || mode === 'approval' || mode === 'clarifying';

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const speak = useCallback((message: string) => {
    if (!preferences.voice_enabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.96;
    utterance.pitch = 1.04;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
  }, [preferences.voice_enabled]);

  useEffect(() => {
    let mounted = true;
    setPreferences(loadPreferences());
    setRecentLogs(loadRecentSummaryLogs(5));

    const hasOnboarded = localStorage.getItem('sunny_onboarded_v1');
    if (!hasOnboarded) setShowOnboarding(true);

    if (window.sunnyDesktop?.onModelProgress) {
      removeProgressListenerRef.current = window.sunnyDesktop.onModelProgress((status) => {
        if (mounted) setModelStatus(status);
      });
    }
    if (window.sunnyDesktop?.getModelStatus) {
      window.sunnyDesktop.getModelStatus().then((status) => {
        if (mounted) {
          setModelStatus(status);
          if (status.status === 'not-downloaded' || status.status === 'downloading') {
            setShowModelOverlay(true);
          }
        }
      });
    }
    if (window.sunnyDesktop?.getDebugLogCount) {
      window.sunnyDesktop.getDebugLogCount().then((result) => {
        if (mounted) setDebugLogCount(result.count);
      });
    }

    return () => {
      mounted = false;
      recognitionRef.current?.abort();
      clearTimers();
      removeProgressListenerRef.current?.();
      window.speechSynthesis.cancel();
    };
  }, [clearTimers]);

  const updatePreferences = (patch: Partial<SunnyPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    savePreferences(next);
  };

  const handleResetPreferences = () => {
    const reset = resetLocalPreferences();
    setPreferences(reset);
  };

  const completeOnboarding = () => {
    localStorage.setItem('sunny_onboarded_v1', 'true');
    setShowOnboarding(false);
  };

  const skipOnboarding = () => {
    localStorage.setItem('sunny_onboarded_v1', 'true');
    setShowOnboarding(false);
  };

  const refreshDebugLogCount = () => {
    window.sunnyDesktop?.getDebugLogCount?.().then((r) => setDebugLogCount(r.count)).catch(() => {});
  };

  const startTask = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isBusy) return;
    clearTimers();
    setTaskError('');
    setVoiceNotice('');
    setInjectionWarning(null);
    setLiveActions([]);
    setPlannedRequest(trimmed);

    if (modelStatus.status !== 'ready' && preferences.brain_provider === 'embedded') {
      setShowModelOverlay(true);
      setMode('model-loading');
      speak("Getting my vision ready. This only happens once!");
      return;
    }

    const clarCheck = needsClarification(trimmed, preferences.clarification_level);
    if (clarCheck.needsClarification) {
      const clar = generateClarifications(trimmed, clarCheck.category);
      if (clar) {
        setClarification(clar);
        setMode('clarifying');
        speak(clar.question);
        return;
      }
    }

    proceedToPlan(trimmed);
  };

  const proceedToPlan = (req: string) => {
    setClarification(null);
    setMode('planning');
    speak("Making a safe plan now.");

    timersRef.current.push(window.setTimeout(() => {
      const destructive = getDestructiveDetails(req);
      if (destructive.length > 0 && preferences.require_sensitive_confirmation) {
        const placeholderActions: PendingAction[] = [
          { description: 'Read the screen to locate the target', safety: 'safe', destructive: null },
          { description: destructive[0].label, safety: 'destructive', destructive: destructive[0] },
          { description: 'Confirm the result', safety: 'safe', destructive: null },
        ];
        setPendingActions(placeholderActions);
        setConfirmReason(destructive[0].reason);
        setConfirmOpen(true);
        setMode('approval');
        speak("I need your approval first.");
      } else {
        runAgentTask(req);
      }
    }, 800));
  };

  const handleClarificationPreset = (refinedRequest: string) => {
    setRequest(refinedRequest);
    setPlannedRequest(refinedRequest);
    speak("Got it. Let me work on that.");
    proceedToPlan(refinedRequest);
  };

  const handleClarificationFreeText = () => {
    const trimmed = request.trim();
    if (trimmed) {
      setPlannedRequest(trimmed);
      proceedToPlan(trimmed);
    }
  };

  const runAgentTask = async (req: string) => {
    setMode('running');
    setLiveActions([]);
    setInjectionWarning(null);
    speak("Working on it now.");

    cancellationTokenRef.current = { cancelled: false };
    const brain = await createBrain(preferences);

    let requiredApproval = false;

    runAgentLoop({
      brain,
      request: req,
      preferences: {
        execution_speed: preferences.execution_speed,
        require_sensitive_confirmation: preferences.require_sensitive_confirmation,
        local_only: preferences.local_only,
      },
      cancellationToken: cancellationTokenRef.current,
      onEvent: (event: LoopEvent) => {
        switch (event.type) {
          case 'state':
            if (event.state === 'OBSERVE') {
              // mid-loop observation
            }
            break;

          case 'plan':
            if (event.actions.length > 0) {
              const pending = actionsToPendingActions(event.actions);
              const { hasDestructive } = classifyActions(event.actions);
              if (hasDestructive && preferences.require_sensitive_confirmation && !confirmOpen) {
                requiredApproval = true;
                setPendingActions(pending);
                setConfirmReason(getDestructiveDetails(formatActionForDisplay(event.actions[0]))[0]?.reason || 'This action could be irreversible.');
                setConfirmOpen(true);
                setMode('approval');
                speak("I need your approval before I continue.");
                cancellationTokenRef.current.cancelled = true;
                return;
              }
              setLiveActions((prev) => [
                ...prev,
                ...event.actions.map((a) => ({
                  description: formatActionForDisplay(a),
                  safety: classifyActions([a]).hasDestructive ? 'destructive' as SafetyLevel : 'moderate' as SafetyLevel,
                  status: 'pending' as const,
                })),
              ]);
            }
            break;

          case 'execute':
            setLiveActions((prev) => {
              const next = [...prev];
              if (next[event.index] && next[event.index].status === 'pending') {
                next[event.index] = { ...next[event.index], status: 'executing' };
              }
              return next;
            });
            break;

          case 'action-complete':
            setLiveActions((prev) => {
              const next = [...prev];
              if (next[event.index]) {
                next[event.index] = { ...next[event.index], status: event.success ? 'done' : 'failed' };
              }
              return next;
            });
            break;

          case 'injection-warning':
            setInjectionWarning({ patterns: event.patterns, severity: event.severity });
            speak("I noticed something unsafe on the screen. I stopped.");
            break;

          case 'action-blocked':
            setTaskError(`Sunny blocked an unsafe action: ${event.reason}`);
            setMode('stopped');
            speak("I blocked an unsafe action.");
            break;

          case 'action-needs-confirm':
            setPendingActions([{
              description: formatActionForDisplay(event.action),
              safety: 'destructive' as SafetyLevel,
              destructive: { category: 'overwrite', label: event.confirmLabel, reason: event.confirmReason },
            }]);
            setConfirmReason(event.confirmReason);
            setConfirmOpen(true);
            setMode('approval');
            speak(event.confirmLabel + '. I need your approval.');
            break;

          case 'clarification-needed':
            setClarification({
              question: event.question,
              presets: [],
              allowFreeText: true,
            });
            setMode('clarifying');
            speak(event.question);
            break;

          case 'stuck':
            setTaskError(event.reason);
            setMode('stopped');
            speak("I seem stuck. Could you check the screen?");
            saveSummaryLog({
              request_text: req,
              summary: 'Task got stuck repeating the same action.',
              outcome: 'failed' as TaskOutcome,
              action_count: liveActions.length,
              required_approval: requiredApproval,
            });
            break;

          case 'complete':
            setMode('completed');
            speak("That's done.");
            saveSummaryLog({
              request_text: req,
              summary: event.summary,
              outcome: 'completed' as TaskOutcome,
              action_count: event.actionCount,
              required_approval: requiredApproval,
            });
            setRecentLogs(loadRecentSummaryLogs(5));
            refreshDebugLogCount();
            break;

          case 'error':
            setTaskError(event.message);
            setMode('stopped');
            speak("Something went wrong. I stopped safely.");
            saveSummaryLog({
              request_text: req,
              summary: event.message,
              outcome: 'failed' as TaskOutcome,
              action_count: liveActions.length,
              required_approval: requiredApproval,
            });
            break;

          case 'stopped':
            setMode('stopped');
            setTaskError('Task was stopped. Some actions may have already been performed.');
            speak("Stopped safely.");
            saveSummaryLog({
              request_text: req,
              summary: 'Task was stopped by the user.',
              outcome: 'stopped' as TaskOutcome,
              action_count: event.partialActions,
              required_approval: requiredApproval,
            });
            setRecentLogs(loadRecentSummaryLogs(5));
            refreshDebugLogCount();
            break;

          default:
            break;
        }
      },
    });
  };

  const emergencyStop = () => {
    clearTimers();
    cancellationTokenRef.current.cancelled = true;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis.cancel();
    window.sunnyDesktop?.cancelActions?.().catch(() => {});
    setConfirmOpen(false);
    setMode('stopped');
    setTaskError('Emergency stop activated. All desktop actions were cancelled immediately.');
    speak('Emergency stop. Everything cancelled.');
  };

  const stopTask = () => {
    clearTimers();
    cancellationTokenRef.current.cancelled = true;
    setMode('stopped');
    setTaskError('Sunny stopped before making any further changes.');
    speak('Stopped safely.');
  };

  const reset = () => {
    clearTimers();
    cancellationTokenRef.current.cancelled = false;
    setMode('ready');
    setRequest('');
    setPlannedRequest('');
    setTaskError('');
    setVoiceNotice('');
    setConfirmOpen(false);
    setPendingActions([]);
    setConfirmReason('');
    setClarification(null);
    setLiveActions([]);
    setInjectionWarning(null);
    window.speechSynthesis.cancel();
  };

  const approveAndRun = () => {
    setConfirmOpen(false);
    setPendingActions([]);
    setConfirmReason('');
    runAgentTask(plannedRequest);
  };

  const declineDestructive = () => {
    setConfirmOpen(false);
    setPendingActions([]);
    setConfirmReason('');
    setMode('stopped');
    setTaskError('Task cancelled. The destructive action was not performed.');
    speak('Cancelled. The action was not performed.');
  };

  const toggleListening = () => {
    if (mode === 'listening') {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setMode('ready');
      setVoiceNotice('Listening stopped.');
      return;
    }
    if (!preferences.voice_enabled) {
      setVoiceNotice('Turn on Voice input in settings first.');
      return;
    }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice('Voice input is not available here. You can still type your request.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      recognitionRef.current = null;
      if (transcript) {
        setRequest(transcript);
        startTask(transcript);
      } else {
        setMode('ready');
        setVoiceNotice("I didn't catch that. Please try again.");
      }
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setMode('ready');
      setVoiceNotice("I couldn't hear that. Check your microphone and try again.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setMode((currentMode) => currentMode === 'listening' ? 'ready' : currentMode);
    };
    recognitionRef.current = recognition;
    setVoiceNotice('Speak naturally, then Sunny will use your words as the request.');
    setMode('listening');
    recognition.start();
  };

  const handleClearLogs = () => {
    window.sunnyDesktop?.clearDebugLogs?.().then(() => {
      refreshDebugLogCount();
    }).catch(() => {});
  };

  const handleExportLogs = () => {
    window.sunnyDesktop?.exportDebugLogs?.().then((result) => {
      const blob = new Blob([result.content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sunny-debug-logs.json';
      a.click();
      URL.revokeObjectURL(url);
    }).catch(() => {});
  };

  const statusText = useMemo(() => {
    switch (mode) {
      case 'ready': return 'Ready when you are';
      case 'listening': return 'Listening closely';
      case 'model-loading': return 'Getting my vision ready';
      case 'clarifying': return 'Quick question';
      case 'planning': return 'Making a safe plan';
      case 'approval': return 'Waiting for your approval';
      case 'running': return 'Working on it';
      case 'completed': return 'Task complete';
      case 'stopped': return 'Task stopped';
      default: return 'Ready';
    }
  }, [mode]);

  const headingText = useMemo(() => {
    if (mode === 'completed') return 'That\u2019s done.';
    if (mode === 'stopped') return 'Paused safely.';
    if (mode === 'clarifying') return 'Quick question';
    return 'What can I help with?';
  }, [mode]);

  const subText = useMemo(() => {
    switch (mode) {
      case 'ready': return 'Tell me what you want to do on your computer.';
      case 'clarifying': return 'I need a little more detail before I start.';
      case 'approval': return 'This request needs one quick safety check.';
      case 'running': return 'I\u2019ll keep you posted as I work.';
      case 'completed': return 'Your computer is ready for the next thing.';
      case 'stopped': return 'Nothing else will happen until you start again.';
      case 'model-loading': return 'Just a moment while I get ready.';
      default: return 'I\u2019m checking the best way to help.';
    }
  }, [mode]);

  const providerReady = modelStatus.status === 'ready' || preferences.brain_provider !== 'embedded';

  return (
    <main className="app-shell">
      {showOnboarding && (
        <OnboardingScreen onComplete={completeOnboarding} onSkip={skipOnboarding} />
      )}
      {canEmergencyStop && (
        <button className="emergency-stop" onClick={emergencyStop} aria-label="Emergency stop \u2014 cancel all actions immediately">
          <Square size={20} fill="currentColor" />
          <span>STOP</span>
        </button>
      )}

      <section className="companion-card" aria-label="Sunny desktop companion">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark"><Sparkles size={18} strokeWidth={2.5} /></div>
            <div>
              <p className="eyebrow">Desktop companion</p>
              <p className="brand-name">Sunny</p>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="connection-pill">
              <span className={`live-dot ${providerReady ? '' : 'loading'}`} />
              {providerReady ? 'Local mode' : 'Loading...'}
            </span>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings2 size={18} /></button>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          </div>
        </header>

        <div className="content-area">
          <section className="hero-block">
            <div className={`mascot-frame ${mode === 'listening' ? 'is-listening' : ''}`}>
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <img src={mascot} alt="Sunny smiling" className="mascot-image" />
              {(mode === 'planning' || mode === 'model-loading') && <span className="thinking-badge"><Sparkles size={15} /> Thinking</span>}
            </div>
            <div className="hero-copy">
              <div className="status-line"><span className={`status-dot status-${mode}`} /> {statusText}</div>
              <h1>{headingText}</h1>
              <p>{subText}</p>
            </div>
          </section>

          {showModelOverlay && modelStatus.status !== 'ready' && (
            <section className="model-overlay">
              <div className="model-overlay-icon"><Download size={24} /></div>
              <p className="panel-kicker">One-time setup</p>
              <h2>Setting up your assistant</h2>
              <p className="model-overlay-msg">{modelStatus.message || 'Downloading Sunny\'s vision model (~1.2 GB). This happens only once!'}</p>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${modelStatus.progress}%` }} />
              </div>
              <p className="model-overlay-pct">{modelStatus.progress}%</p>
              <p className="model-overlay-note">After this, Sunny works completely offline. No internet needed.</p>
            </section>
          )}

          {(mode === 'ready' || mode === 'listening') && !showModelOverlay && (
            <form className="request-form" onSubmit={(event) => { event.preventDefault(); startTask(request); }}>
              <label htmlFor="request">Your request</label>
              <div className="input-wrap">
                <textarea id="request" value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Try \u201copen my email and find anything important\u201d" rows={2} disabled={mode === 'listening'} />
                <button type="button" className={`voice-button ${mode === 'listening' ? 'is-active' : ''}`} onClick={toggleListening} aria-label={mode === 'listening' ? 'Stop listening' : 'Start voice input'}><Mic size={20} /></button>
              </div>
              {voiceNotice && <p className="voice-notice" aria-live="polite">{voiceNotice}</p>}
              <button className="primary-button" type="submit" disabled={!request.trim()}><span>Ask Sunny</span><ArrowUpRight size={19} /></button>
            </form>
          )}

          {mode === 'ready' && !showModelOverlay && (
            <section className="quick-section">
              <div className="section-heading"><span>Popular requests</span><span className="section-rule" /></div>
              <div className="quick-grid">
                {quickTasks.map(({ label, request: quickRequest, icon: Icon }) => (
                  <button className="quick-card" key={label} onClick={() => { setRequest(quickRequest); startTask(quickRequest); }}>
                    <span className="quick-icon"><Icon size={18} /></span><span>{label}</span><ChevronRight size={16} className="quick-arrow" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {mode === 'clarifying' && clarification && (
            <section className="clarify-panel">
              <div className="clarify-icon"><CircleHelp size={22} /></div>
              <div className="clarify-copy">
                <p className="panel-kicker">Quick question</p>
                <h2>{clarification.question}</h2>
                <p>You said: &ldquo;{plannedRequest}&rdquo;</p>
              </div>
              <div className="clarify-presets">
                {clarification.presets.map((preset) => (
                  <button
                    key={preset.label}
                    className="clarify-preset"
                    onClick={() => handleClarificationPreset(preset.refinedRequest)}
                  >
                    <span>{preset.label}</span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
              {clarification.allowFreeText && (
                <div className="clarify-freetext">
                  <input
                    type="text"
                    placeholder="Or type your own answer..."
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleClarificationFreeText(); }}
                  />
                  <button className="primary-button" onClick={handleClarificationFreeText} disabled={!request.trim()}>
                    <span>Continue</span><ArrowUpRight size={17} />
                  </button>
                </div>
              )}
              <button className="secondary-button full-button" onClick={reset}><X size={16} /> Cancel</button>
            </section>
          )}

          {mode === 'approval' && !confirmOpen && (
            <section className="approval-panel">
              <div className="approval-icon"><ShieldCheck size={22} /></div>
              <div className="approval-copy"><p className="panel-kicker">Safety check</p><h2>Sunny wants to perform a sensitive action</h2><p>&ldquo;{plannedRequest}&rdquo;</p><span className="approval-note"><LockKeyhole size={14} /> You stay in control</span></div>
              <div className="approval-actions"><button className="secondary-button" onClick={reset}>Not now</button><button className="primary-button" onClick={approveAndRun}><Check size={18} /> Approve</button></div>
            </section>
          )}

          {(mode === 'planning' || mode === 'running' || mode === 'completed' || mode === 'stopped') && (
            <section className="task-panel">
              <div className="task-heading">
                <div><p className="panel-kicker">Current task</p><h2>{plannedRequest}</h2></div>
                {mode === 'running' && <button className="stop-button" onClick={stopTask}><Square size={15} fill="currentColor" /> Stop</button>}
              </div>
              <div className="task-meta">
                <span><MousePointer2 size={14} /> Desktop actions</span>
                <span><Gauge size={14} /> {speedOptions.find((option) => option.value === preferences.execution_speed)?.label} pace</span>
                <span><Brain size={14} /> {providerLabels.find((p) => p.value === preferences.brain_provider)?.label.split(' ')[0]}</span>
              </div>

              {injectionWarning && (
                <div className="injection-banner">
                  <div className="injection-icon"><AlertTriangle size={18} /></div>
                  <div>
                    <strong>Suspicious content detected on screen</strong>
                    <p>Sunny found text that looks like it might be trying to override instructions. Stopped for your safety.</p>
                    {injectionWarning.patterns.length > 0 && <small>Detected: {injectionWarning.patterns.join(', ')}</small>}
                  </div>
                  <button className="secondary-button" onClick={emergencyStop}><Square size={14} /> Stop &amp; review</button>
                </div>
              )}

              {liveActions.length > 0 ? (
                <ol className="steps-list">
                  {liveActions.map((action, index) => {
                    const done = action.status === 'done';
                    const active = action.status === 'executing';
                    const failed = action.status === 'failed';
                    return (
                      <li className={`task-step ${done ? 'done' : ''} ${active ? 'active' : ''} ${failed ? 'failed' : ''}`} key={index}>
                        <span className="step-number">
                          {done ? <Check size={15} /> : active ? <span className="step-spinner" /> : failed ? <AlertTriangle size={15} /> : <MousePointer2 size={15} />}
                        </span>
                        <span>
                          <strong>{action.description}</strong>
                          <small className={`safety-${action.safety}`}>{action.safety === 'destructive' ? 'Destructive' : action.safety === 'moderate' ? 'Moderate' : 'Safe'}</small>
                        </span>
                        {active && <span className="step-state">Now</span>}
                      </li>
                    );
                  })}
                </ol>
              ) : mode === 'planning' ? (
                <div className="plan-loading"><span className="step-spinner" /> <span>Analyzing the screen and planning actions...</span></div>
              ) : null}

              {taskError && <p className="task-error">{taskError}</p>}
              {(mode === 'completed' || mode === 'stopped') && <button className="secondary-button full-button" onClick={reset}><RotateCcw size={16} /> Ask something else</button>}
            </section>
          )}

          {recentLogs.length > 0 && mode === 'ready' && !showModelOverlay && (
            <section className="summary-log-section">
              <div className="section-heading"><span>Recent activity</span><span className="section-rule" /></div>
              <ul className="log-list">
                {recentLogs.map((log) => (
                  <li key={log.id} className={`log-entry log-${log.outcome}`}>
                    <span className={`log-dot log-dot-${log.outcome}`} />
                    <span className="log-text">{log.summary || log.request_text}</span>
                    <span className="log-time">{log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="privacy-note"><LockKeyhole size={14} /><span>Screen understanding stays on this computer by default.</span><button onClick={() => setSettingsOpen(true)}><CircleHelp size={14} /> How it works</button></footer>
        </div>
      </section>

      {confirmOpen && (
        <div className="confirm-backdrop" onClick={declineDestructive}>
          <div className="confirm-dialog" onClick={(event) => event.stopPropagation()} role="alertdialog" aria-label="Destructive action confirmation">
            <div className="confirm-header">
              <div className="confirm-icon"><ShieldAlert size={26} /></div>
              <div>
                <p className="panel-kicker">Destructive action</p>
                <h2>Confirm before Sunny proceeds</h2>
              </div>
            </div>
            <p className="confirm-request">&ldquo;{plannedRequest}&rdquo;</p>
            <p className="confirm-warning">{confirmReason}</p>
            <div className="confirm-actions-list">
              <p className="confirm-list-label">Sunny plans to:</p>
              <ul>
                {pendingActions.map((action, index) => (
                  <li key={index} className={action.destructive ? 'is-destructive' : ''}>
                    {action.destructive ? (
                      (() => { const Icon = DESTRUCTIVE_ICONS[action.destructive!.category]; return <span className="action-icon destructive-icon"><Icon size={15} /></span>; })()
                    ) : (
                      <span className="action-icon safe-icon"><Check size={15} /></span>
                    )}
                    <span>{action.description}</span>
                    {action.destructive && <span className="action-flag">{action.destructive.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="confirm-buttons">
              <button className="secondary-button" onClick={declineDestructive}><X size={17} /> Cancel</button>
              <button className="primary-button confirm-approve" onClick={approveAndRun}><Check size={17} /> Approve anyway</button>
            </div>
            <button className="confirm-emergency" onClick={emergencyStop}>
              <Square size={14} fill="currentColor" /> Emergency stop
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          preferences={preferences}
          onUpdate={updatePreferences}
          onReset={handleResetPreferences}
          modelStatus={modelStatus}
          debugLogCount={debugLogCount}
          onClearLogs={handleClearLogs}
          onExportLogs={handleExportLogs}
          onInitModel={() => { window.sunnyDesktop?.initModel?.(); setShowModelOverlay(true); setSettingsOpen(false); }}
        />
      )}
    </main>
  );
}

export default App;
