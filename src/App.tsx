import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Battery,
  Wifi,
  Cpu,
  HardDrive,
  Globe,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  Volume2,
  VolumeX,
  RefreshCw,
  Trash2,
  MessageSquare,
  Shield,
  Utensils,
  Pill,
  Newspaper,
  Sun,
  Moon,
  Thermometer,
  Droplets,
  Wind,
  Gauge,
  Eye,
  CloudRain,
  CloudSun,
  Sunrise,
  ArrowUpDown,
  Contrast,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Search,
  Plus,
  Settings,
  RotateCcw,
  Pin,
  Maximize2,
  Minimize2,
  Send,
  Terminal,
  ScrollText,
  Sparkles,
  Bookmark,
  Square,
} from "lucide-react";
import { sunnyBrain, type ChatMessage } from "@/renderer/services/sunnyBrain";
import type { SystemStatus, Recipe, DailyDigest } from "@/types/electron";
import type { ModelStatus } from "@/vite-env";
import ErrorBoundary from "@/components/ErrorBoundary";
import OfflineFallback from "@/components/OfflineFallback";
import Footer from "@/components/Footer";
import { SettingsModal } from "@/components/SettingsModal";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import LockScreen from "@/components/LockScreen";
import { UpdateToast } from "@/components/UpdateToast";
import { WeatherPanel } from "@/components/WeatherPanel";
import { MicButton } from "@/components/MicButton";
import {
  loadLocalPreferences,
  saveLocalPreferences,
  defaultPreferences,
  type SunnyPreferences,
} from "@/lib/local-preferences";
import { loadWeatherPreferences, WEATHER_PREFS_CHANGED_EVENT } from "@/lib/weather-preferences";
import CollapsibleSection from "@/components/CollapsibleSection";
import {
  defaultSectionState,
  loadSectionState,
  saveSectionState,
  type SectionId,
  type SectionState,
} from "@/lib/section-state";
import mascot from "/assets/mascot.png";

/** UV index descriptor for the weather tiles (Low, Moderate, ...). */
function uvIndexLabel(uv: number): string {
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very High";
  return "Extreme";
}

/**
 * Unwrap the envelope every tool call comes back in.
 *
 * The main process answers tool calls with `{ success, data }`, sunnyBrain
 * wraps that again in its own `{ success, toolName, result }`, and the chat
 * handler acts on the inner object. Returns `{}` for anything the bridge
 * could not produce so the caller can decide what "no answer" means.
 */
function unwrapToolResult(toolResult: unknown): Record<string, unknown> {
  const result = (toolResult as { result?: unknown } | undefined)?.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const box = result as Record<string, unknown>;
    const data = box.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return box;
  }
  return {};
}
// WebP keeps these illustrations ~7x smaller than the PNG fallback and is
// supported natively by the Chromium engine Electron ships.
import mascotChef from "/assets/sunny-mascot-chef.webp";
import mascotPills from "/assets/sunny-mascot-pills.webp";
import mascotNewspaper from "/assets/sunny-mascot-newspaper.webp";
import mascotMicrophone from "/assets/sunny-mascot-microphone.webp";
import mascotStethoscope from "/assets/sunny-mascot-stethoscope.webp";
import mascotMagnifying from "/assets/sunny-mascot-magnifying.webp";

const POLL_INTERVAL = 30000;

function App() {
  const isBrowserPreview = typeof window !== "undefined" && !window.electronAPI;
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showWeather, setShowWeather] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [cookingMode, setCookingMode] = useState<{ recipe: Recipe; currentStep: number } | null>(null);
  const [medicationReminders, setMedicationReminders] = useState<Array<{ id: string; pillName: string; timeString: string; enabled: boolean; lastTaken?: string; triggeredAt?: string }>>([]);
  // Set when a reminder fires; renders a big full-window overlay so the
  // user cannot miss it even if they are not looking at the chat.
  const [medicationPopup, setMedicationPopup] = useState<{ id: string; pillName: string; timeString: string } | null>(null);
  const [medModal, setMedModal] = useState<{ open: boolean; pillName: string; timeString: string; error: string | null }>({ open: false, pillName: "", timeString: "", error: null });
  const [dailyDigest, setDailyDigest] = useState<DailyDigest | null>(null);
  // The digest has its own error. The shared `error` state is rendered
  // inside the System Health card, so a digest failure used to appear
  // above the battery and Wi-Fi readings, where it looked like a
  // problem with the computer rather than with the news.
  const [digestError, setDigestError] = useState<string | null>(null);
  const [isFetchingDigest, setIsFetchingDigest] = useState(false);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Recipe[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recipeSearchError, setRecipeSearchError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [openSections, setOpenSections] = useState<SectionState>(defaultSectionState);
  const [windowFilled, setWindowFilled] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [debugLogCount, setDebugLogCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [preferences, setPreferences] = useState<SunnyPreferences>(defaultPreferences);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isProcessingChat, setIsProcessingChat] = useState(false);
  // The three workspace areas share one message store but never mix entries.
  // Chat is the conversation, Commands is the LLM-executed task history, and
  // Activity Log is everything Sunny has actually done on its own.
  const [activeView, setActiveView] = useState<"chat" | "commands" | "activity" | "routines">("chat");
  const [commandInput, setCommandInput] = useState("");
  // An action waiting for a plain-language yes/no. The main process holds the
  // real action; the renderer only gets a token and a question to show.
  const [pendingHold, setPendingHold] = useState<{ token: string; question: string } | null>(null);
  // A computer-use job currently running, so it can be stopped from the UI.
  const [activeJob, setActiveJob] = useState<{ jobId: string; step: number; label: string; total: number } | null>(null);
  // Saved routines, read from the main process for the Routines view.
  const [routines, setRoutines] = useState<Array<{ phrase: string; steps: string[]; createdAt?: string }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const chatMessages = useMemo(() => messages.filter((m) => m.kind === "chat"), [messages]);
  const commandMessages = useMemo(() => messages.filter((m) => m.kind === "command"), [messages]);
  const activityMessages = useMemo(() => messages.filter((m) => m.kind === "event"), [messages]);

  const scrollToBottom = useCallback(() => {
    // Scroll only the message list. scrollIntoView would also scroll the whole
    // app-main and push the workspace header out of sight on tall screens.
    const list = chatEndRef.current?.parentElement;
    if (list) list.scrollTop = list.scrollHeight;
  }, []);

  useEffect(() => {
    const unsubscribe = window.windowControls?.onWindowFilledChanged?.((filled) => {
      setWindowFilled(filled);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  // Live progress from the hands loop, so the job can be stopped if it wanders.
  useEffect(() => {
    return window.sunnyDesktop?.onJobProgress?.((info) => setActiveJob(info)) ?? undefined;
  }, []);

  // Load saved routines whenever the Routines view is opened.
  useEffect(() => {
    if (activeView !== "routines") return;
    let cancelled = false;
    window.sunnyDesktop?.getRoutines?.()
      .then((list) => { if (!cancelled) setRoutines(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setRoutines([]); });
    return () => { cancelled = true; };
  }, [activeView]);

  const statusUnsubscribeRef = useRef<(() => void) | null>(null);
  const messagesUnsubscribeRef = useRef<(() => void) | null>(null);
  const medicationUnsubscribeRef = useRef<(() => void) | null>(null);
  const medicationAddedUnsubscribeRef = useRef<(() => void) | null>(null);
  const cookingStepUnsubscribeRef = useRef<(() => void) | null>(null);

  const loadPreferences = useCallback(async () => {
    const prefs = loadLocalPreferences();
    setPreferences(prefs);
    setOpenSections(loadSectionState());
    // Re-assert them in the main process: it holds no persisted copy, so a
    // restart would otherwise silently reset every setting to its default.
    try {
      await window.electronAPI?.setPreferences?.(prefs);
    } catch (e) {
      console.error('Failed to sync preferences to main process:', e);
    }
    if (!prefs.has_completed_onboarding) {
      setShowOnboarding(true);
    }
    // The updater preference lives in the main process so it survives a
    // cleared localStorage; reflect the stored value, not the default.
    try {
      const stored = await window.electronAPI?.getAutoCheckUpdates?.();
      if (typeof stored === 'boolean') setAutoCheckUpdates(stored);
    } catch {
      // Non-fatal: the main process defaults to enabled.
    }
    if (window.sunnyDesktop?.getModelStatus) {
      try {
        const status = await window.sunnyDesktop.getModelStatus();
        if (status) {
          setModelStatus(status);
          // The window may load after a failed startup attempt, in which case
          // no progress event was ever delivered. Recover the reason here.
          setModelError(status.status === "error" ? status.message : null);
        }
        const result = await window.sunnyDesktop.getDebugLogCount?.();
        if (result && typeof result.count === 'number') setDebugLogCount(result.count);
      } catch {
        // Ignore model status errors
      }
    }
  }, []);

  const handlePreferencesUpdate = useCallback((patch: Partial<SunnyPreferences>) => {
    const newPrefs = { ...preferences, ...patch };
    setPreferences(newPrefs);
    saveLocalPreferences(newPrefs);
    // Mirror into the main process. localStorage lives in the renderer, and
    // the main process is where these settings actually change behaviour, so
    // without this every toggle was purely decorative.
    void window.electronAPI?.setPreferences?.(newPrefs);
  }, [preferences]);

  const handlePreferencesReset = useCallback(() => {
    const newPrefs = { ...defaultPreferences };
    setPreferences(newPrefs);
    saveLocalPreferences(newPrefs);
    void window.electronAPI?.setPreferences?.(newPrefs);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    const newPrefs = { ...preferences, has_completed_onboarding: true };
    setPreferences(newPrefs);
    saveLocalPreferences(newPrefs);
    setShowOnboarding(false);
  }, [preferences]);

  const handleOnboardingSkip = useCallback(() => {
    const newPrefs = { ...preferences, has_completed_onboarding: true };
    setPreferences(newPrefs);
    saveLocalPreferences(newPrefs);
    setShowOnboarding(false);
  }, [preferences]);

  const handleClearLogs = useCallback(async () => {
    try {
      await window.sunnyDesktop?.clearDebugLogs?.();
      setDebugLogCount(0);
    } catch (e) {
      console.error('Failed to clear logs:', e);
    }
  }, []);

  const handleExportLogs = useCallback(async () => {
    try {
      const result = await window.sunnyDesktop?.exportDebugLogs?.();
      if (result?.content) {
        const blob = new Blob([result.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sunny-debug-logs-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Failed to export logs:', e);
    }
  }, []);

  // --- Window chrome ------------------------------------------------------
  // The window is frameless, so these route the custom title bar's buttons.
  // Each is guarded because the renderer also runs in a plain browser during
  // UI work, where windowControls does not exist.
  // Sections fold away so the small window stays usable. Which ones are open
  // is remembered, so the app reopens the way it was left.
  const toggleSection = useCallback((id: SectionId) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveSectionState(next);
      return next;
    });
  }, []);

  // Used when something happens that the user needs to see: a reminder
  // firing, a digest arriving, a recipe being chosen. Folding a section
  // closed must never hide a result the user just asked for.
  const expandSection = useCallback((id: SectionId) => {
    setOpenSections((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: true };
      saveSectionState(next);
      return next;
    });
  }, []);

  const handleToggleWindowFilled = useCallback(() => {
    void window.windowControls?.toggleWindowFilled().then((filled) => {
      if (typeof filled === "boolean") setWindowFilled(filled);
    });
  }, []);

  const handleToggleAlwaysOnTop = useCallback(() => {
    void window.windowControls?.setAlwaysOnTop(!alwaysOnTop).then(setAlwaysOnTop);
  }, [alwaysOnTop]);

  const handleMinimizeWindow = useCallback(() => {
    void window.windowControls?.minimizeWindow?.();
  }, []);

  const handleCloseWindow = useCallback(() => {
    void window.windowControls?.closeWindow?.();
  }, []);

  // Reflect always-on-top changes made from the tray menu.
  useEffect(() => {
    const controls = window.windowControls;
    if (!controls?.onAlwaysOnTopChanged) return;
    void controls.getAlwaysOnTop().then(setAlwaysOnTop).catch(() => {});
    return controls.onAlwaysOnTopChanged(setAlwaysOnTop);
  }, []);

  const handleInitModel = useCallback(async () => {
    if (!window.sunnyDesktop?.initModel) return;
    try {
      const status = await window.sunnyDesktop.initModel();
      setModelStatus(status);
      setModelError(status?.status === "error" ? status.message : null);
    } catch (e) {
      // Surface the reason rather than failing silently into the console.
      const reason = e instanceof Error ? e.message : String(e);
      console.error('Failed to init model:', e);
      setModelError(reason);
    }
  }, []);

  const handleAutoCheckUpdatesChange = useCallback((enabled: boolean) => {
    setAutoCheckUpdates(enabled);
    // Persist to the main process. Setting local state alone left this toggle
    // decorative: nothing downstream ever read it.
    void window.electronAPI?.setAutoCheckUpdates?.(enabled);
  }, []);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
    // Check if PIN lock is enabled
    if (window.electronAPI?.hasPin) {
      window.electronAPI.hasPin().then((result) => {
        if (result?.hasPin) {
          setIsLocked(true);
        }
      }).catch(() => {});
    }
    // Listen for lock-app events from main process (auto-lock)
    if (window.electronAPI?.onLockApp) {
      const unsub = window.electronAPI.onLockApp(() => {
        setIsLocked(true);
      });
      return () => { unsub(); };
    }
  }, [loadPreferences]);

  // Escape dismisses the full weather overlay (the corner X can sit in the
  // frameless window's title-bar drag region in packaged builds).
  useEffect(() => {
    if (!showWeather) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowWeather(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showWeather]);

  // Subscribe to model progress
  useEffect(() => {
    if (!window.sunnyDesktop?.onModelProgress) return;
    const unsub = window.sunnyDesktop.onModelProgress((status: ModelStatus) => {
      setModelStatus(status);
      // Carry the main process's reason through so the notice explains what
      // actually went wrong instead of a generic "not available".
      setModelError(status.status === "error" ? status.message : null);
    });
    return unsub;
  }, []);

  // Main sunnyBrain subscriptions
  useEffect(() => {
    statusUnsubscribeRef.current = sunnyBrain.onSystemStatusChange((status) => {
      setSystemStatus(status);
      setIsLoading(false);
      setError(null);
    });

    messagesUnsubscribeRef.current = sunnyBrain.subscribe((msgs) => {
      setMessages(msgs);
      scrollToBottom();
    });

    medicationUnsubscribeRef.current = sunnyBrain.onMedicationReminder((reminder) => {
      setMedicationReminders((prev) => {
        const exists = prev.find((r) => r.id === reminder.id);
        if (exists) {
          return prev.map((r) => (r.id === reminder.id ? { ...r, ...reminder, triggeredAt: reminder.triggeredAt } : r));
        }
        return [...prev, reminder];
      });
      setMedicationPopup({ id: reminder.id, pillName: reminder.pillName, timeString: reminder.timeString });
      sunnyBrain.addMessage("system", `\u{1F48A} Medication Reminder: Time to take ${reminder.pillName}!`);
      expandSection("medication");
      sunnyBrain.speakNotification(`Time to take your ${reminder.pillName}!`, "high", 2);
    });

    medicationAddedUnsubscribeRef.current = sunnyBrain.onMedicationReminderAdded((reminder) => {
      setMedicationReminders((prev) => {
        if (prev.find((r) => r.id === reminder.id)) return prev;
        return [...prev, reminder];
      });
    });

    cookingStepUnsubscribeRef.current = sunnyBrain.onCookingStepChange((step) => {
      setCookingMode((prev) => (prev ? { ...prev, currentStep: step.stepIndex } : null));
      if (window.electronAPI) {
        sunnyBrain.speakNotification(`Step ${step.stepIndex + 1} of ${step.totalSteps}: ${step.instruction}`, "normal", 1);
      }
    });

    const loadMedicationReminders = async () => {
      try {
        const reminders = await sunnyBrain.getMedicationReminders();
        setMedicationReminders(reminders);
      } catch (e) {
        console.error("Failed to load medication reminders:", e);
      }
    };
    loadMedicationReminders();

    if (!window.electronAPI) {
      setError(null);
      setIsLoading(false);
      sunnyBrain.addMessage(
        "system",
        "You are viewing Sunny in a web browser. To check the computer health, hear spoken reminders, and use the medication tools, please download the free Sunny desktop app from GitHub Releases."
      );
    } else {
      sunnyBrain
        .getSystemStatus()
        .then(setSystemStatus)
        .catch((e) => setError(e.message))
        .finally(() => setIsLoading(false));

      sunnyBrain.startStatusPolling(POLL_INTERVAL);
    }

    sunnyBrain.addMessage("system", "Welcome to Sunny. The computer health status appears above. Press the buttons below to check your system or hear it spoken aloud.");

    return () => {
      statusUnsubscribeRef.current?.();
      messagesUnsubscribeRef.current?.();
      medicationUnsubscribeRef.current?.();
      medicationAddedUnsubscribeRef.current?.();
      cookingStepUnsubscribeRef.current?.();
      sunnyBrain.stopStatusPolling();
    };
  }, [scrollToBottom, expandSection]);


  const describeError = useCallback((err: unknown): string => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "string" && err) return err;
    return "Something went wrong and Sunny could not complete the request.";
  }, []);

  const handleCheckHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const status = await sunnyBrain.getSystemStatus();
      setSystemStatus(status);
      sunnyBrain.addMessage("assistant", formatStatusForSpeech(status));
    } catch (e) {
      const message = describeError(e);
      setError(message);
      sunnyBrain.addMessage("system", "Error: " + message);
    } finally {
      setIsLoading(false);
    }
  }, [describeError]);

  const handleSpeakStatus = useCallback(async () => {
    if (!systemStatus) return;
    setIsSpeaking(true);
    try {
      const text = formatStatusForSpeech(systemStatus);
      await sunnyBrain.speakNotification(text, "normal", 1);
      sunnyBrain.addMessage("assistant", "SPOKEN: " + text);
    } catch (e) {
      const message = describeError(e);
      setError(message);
      sunnyBrain.addMessage("system", "Speech error: " + message);
    } finally {
      setIsSpeaking(false);
    }
  }, [systemStatus, describeError]);

  const handleClearChat = useCallback(() => {
    sunnyBrain.clearMessages();
    sunnyBrain.addMessage("system", "Chat cleared. System health status is still shown above.");
  }, []);


  const handleSearchRecipe = useCallback(async () => {
    if (!recipeSearchQuery.trim()) return;
    setIsSearching(true);
    setRecipeSearchError(null);
    try {
      const result = await sunnyBrain.triggerQuickAction('recipe', {
        query: recipeSearchQuery,
        maxResults: 5,
      });
      if (result.success) {
        const recipes = (result.result as { recipes: Recipe[] }).recipes;
        setSearchResults(recipes);
        if (recipes.length === 0) {
          sunnyBrain.addMessage(
            "assistant",
            `I couldn't find anything for "${recipeSearchQuery}". Try a simpler search - like "cookies", "chicken" or "pasta".`
          );
        } else {
          sunnyBrain.addMessage("assistant", `Found ${recipes.length} recipe(s) for "${recipeSearchQuery}".`);
        }
      } else {
        setRecipeSearchError(result.error ?? null);
        sunnyBrain.addMessage("system", "Recipe search failed: " + result.error);
      }
    } catch (e) {
      const message = describeError(e);
      setRecipeSearchError(message);
      sunnyBrain.addMessage("system", "Recipe search error: " + message);
    } finally {
      setIsSearching(false);
    }
  }, [recipeSearchQuery, describeError]);

  const handleSelectRecipe = useCallback((recipe: Recipe) => {
    expandSection("recipes");
    setCookingMode({ recipe, currentStep: 0 });
    sunnyBrain.addMessage("assistant", `Starting cooking mode for ${recipe.title}. Step 1 of ${recipe.instructions.length}: ${recipe.instructions[0]}`);
    sunnyBrain.speakNotification(`Starting cooking mode for ${recipe.title}. Step 1: ${recipe.instructions[0]}`, "normal", 1);
  }, [expandSection]);

  const handleNextStep = useCallback(() => {
    if (!cookingMode) return;
    const nextStep = cookingMode.currentStep + 1;
    if (nextStep < cookingMode.recipe.instructions.length) {
      setCookingMode((prev) => (prev ? { ...prev, currentStep: nextStep } : null));
      const step = cookingMode.recipe.instructions[nextStep];
      sunnyBrain.addMessage("assistant", `Step ${nextStep + 1}: ${step}`);
      sunnyBrain.speakNotification(`Step ${nextStep + 1}: ${step}`, "normal", 1);
      if (window.electronAPI) {
        window.electronAPI.invokeTool("emit_cooking_step", { stepIndex: nextStep, totalSteps: cookingMode.recipe.instructions.length, instruction: step });
      }
    }
  }, [cookingMode]);

  const handlePreviousStep = useCallback(() => {
    if (!cookingMode || cookingMode.currentStep === 0) return;
    const prevStep = cookingMode.currentStep - 1;
    setCookingMode((prev) => (prev ? { ...prev, currentStep: prevStep } : null));
    const step = cookingMode.recipe.instructions[prevStep];
    sunnyBrain.addMessage("assistant", `Step ${prevStep + 1}: ${step}`);
    sunnyBrain.speakNotification(`Step ${prevStep + 1}: ${step}`, "normal", 1);
    if (window.electronAPI) {
      window.electronAPI.invokeTool("emit_cooking_step", { stepIndex: prevStep, totalSteps: cookingMode.recipe.instructions.length, instruction: cookingMode.recipe.instructions[prevStep] });
    }
  }, [cookingMode]);

  const handleExitCookingMode = useCallback(() => {
    setCookingMode(null);
    sunnyBrain.addMessage("system", "Cooking mode exited.");
  }, []);


  const handleScheduleMedication = useCallback(async (pillName: string, timeString: string) => {
    setMedModal((m) => ({ ...m, error: null }));
    try {
      const result = await sunnyBrain.triggerQuickAction('meds', { pillName, timeString });
      if (result.success) {
        sunnyBrain.addMessage("assistant", `Medication reminder set for ${pillName} at ${timeString}.`);
        sunnyBrain.speakNotification(`Medication reminder set for ${pillName} at ${timeString}.`, "normal", 1);
        setMedModal({ open: false, pillName: "", timeString: "", error: null });
      } else {
        setMedModal((m) => ({ ...m, error: result.error ?? null }));
      }
    } catch (e) {
      const message = describeError(e);
      setMedModal((m) => ({ ...m, error: message }));
    }
  }, [describeError]);

  const handleMedicationTaken = useCallback(async (reminderId: string) => {
    try {
      await sunnyBrain.markMedicationTaken(reminderId);
      setMedicationReminders((prev) => prev.map((r) => (r.id === reminderId ? { ...r, enabled: false, lastTaken: new Date().toISOString() } : r)));
      sunnyBrain.addMessage("system", "Medication marked as taken.");
    } catch (e) {
      const message = describeError(e);
      setError(message);
    }
  }, [describeError]);

  const handleDeleteMedication = useCallback(async (reminderId: string) => {
    try {
      await sunnyBrain.deleteMedicationReminder(reminderId);
      setMedicationReminders((prev) => prev.filter((r) => r.id !== reminderId));
    } catch (e) {
      const message = describeError(e);
      setError(message);
    }
  }, [describeError]);

  // The Morning Digest follows the location and unit the user saved in the
  // full weather view, so the main screen and the overlay never disagree.
  const getDigestWeatherParams = useCallback(() => {
    const prefs = loadWeatherPreferences();
    const active = prefs.activeLocation;
    return {
      location: active
        ? { latitude: active.latitude, longitude: active.longitude, name: active.name }
        : 'auto',
      unit: prefs.unit,
    };
  }, []);

  const handleFetchDailyDigest = useCallback(async () => {
    setIsFetchingDigest(true);
    setDigestError(null);
    try {
      const result = await sunnyBrain.triggerQuickAction('news', getDigestWeatherParams());
      if (result.success) {
        setDailyDigest(result.result as DailyDigest | null);
        expandSection("digest");
        sunnyBrain.addMessage("assistant", "Morning digest loaded with weather and news.");
      } else {
        setDigestError(result.error ?? null);
        sunnyBrain.addMessage("system", "Digest failed: " + result.error);
      }
    } catch (e) {
      setDigestError(describeError(e));
      sunnyBrain.addMessage("system", "Digest error: " + describeError(e));
    } finally {
      setIsFetchingDigest(false);
    }
  }, [describeError, expandSection, getDigestWeatherParams]);

  // Keep the main-screen digest in sync when the user saves a new location or
  // switches units in the full weather view.
  useEffect(() => {
    if (!dailyDigest) return;
    const onWeatherPrefsChanged = () => { void handleFetchDailyDigest(); };
    window.addEventListener(WEATHER_PREFS_CHANGED_EVENT, onWeatherPrefsChanged);
    return () => window.removeEventListener(WEATHER_PREFS_CHANGED_EVENT, onWeatherPrefsChanged);
  }, [dailyDigest, handleFetchDailyDigest]);

  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isProcessingChat) return;
    
    const input = chatInput.trim();
    setChatInput("");
    setIsProcessingChat(true);
    
    // Add user message to chat
    sunnyBrain.addMessage("user", input, "chat");
    
    try {
      // Use the decide_action tool to interpret the command
      const result = await sunnyBrain.invokeTool("decide_action", { prompt: input });

      const decision = unwrapToolResult(result) as {
        response?: string;
        actions?: Array<{ type: string }>;
        success?: boolean;
        error?: string;
        held?: { token: string; question: string };
      };

      if (decision.held) {
        setPendingHold(decision.held);
        sunnyBrain.addMessage("system", decision.held.question, "chat");
        return;
      }

      if (result.success && decision.success === false) {
        sunnyBrain.addMessage("system", "Could not understand: " + (decision.error || "Unknown error"), "chat");
      } else if (result.success) {
        const actions = decision.actions;
        if (Array.isArray(actions) && actions.length > 0) {
          // Execute the actions
          const execResult = await sunnyBrain.invokeTool("execute_actions", { actions });
          const execOutcome = unwrapToolResult(execResult) as { success?: boolean; error?: string };
          if (execOutcome.success === false) {
            sunnyBrain.addMessage("system", "Execution failed: " + (execOutcome.error || "Unknown error"), "chat");
          } else {
            sunnyBrain.addMessage("assistant", decision.response || "Done.", "chat");
          }
        } else {
          // No actions to execute, just respond
          sunnyBrain.addMessage("assistant", decision.response || "Done.", "chat");
        }
      } else {
        sunnyBrain.addMessage("system", "Could not understand: " + (result.error || "Unknown error"), "chat");
      }
    } catch (e) {
      const message = describeError(e);
      sunnyBrain.addMessage("system", "Error: " + message, "chat");
    } finally {
      setIsProcessingChat(false);
      setActiveJob(null);
    }
  }, [chatInput, describeError, isProcessingChat]);

  /** A typed task from the Commands tab: the LLM decides and Sunny executes it. */
  const handleCommandSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const task = commandInput.trim();
    if (!task || isProcessingChat) return;

    setCommandInput("");
    setIsProcessingChat(true);
    sunnyBrain.addMessage("user", task, "command");

    try {
      const result = await sunnyBrain.invokeTool("decide_action", { prompt: task });
      const decision = unwrapToolResult(result) as {
        response?: string;
        actions?: Array<{ type: string }>;
        success?: boolean;
        error?: string;
        held?: { token: string; question: string };
      };

      if (decision.held) {
        setPendingHold(decision.held);
        sunnyBrain.addMessage("system", decision.held.question, "command");
        return;
      }

      if (result.success && decision.success !== false) {
        const actions = decision.actions;
        if (Array.isArray(actions) && actions.length > 0) {
          const execResult = await sunnyBrain.invokeTool("execute_actions", { actions });
          const execOutcome = unwrapToolResult(execResult) as { success?: boolean; error?: string };
          if (execOutcome.success === false) {
            sunnyBrain.addMessage(
              "system",
              "Could not finish: " + (execOutcome.error || "Unknown error"),
              "command"
            );
            return;
          }
        }
        sunnyBrain.addMessage(
          "assistant",
          decision.response || "Done. " + (actions?.length ? `${actions.length} action(s) completed.` : ""),
          "command"
        );
      } else {
        sunnyBrain.addMessage(
          "system",
          "Could not understand: " + ((result.success ? decision.error : result.error) || "Unknown error"),
          "command"
        );
      }
    } catch (e) {
      sunnyBrain.addMessage("system", "Error: " + describeError(e), "command");
    } finally {
      setIsProcessingChat(false);
      setActiveJob(null);
    }
  }, [commandInput, describeError, isProcessingChat]);

  /** Answer a permission question the main process is holding. */
  const handleHoldAnswer = useCallback(async (answer: "yes" | "no") => {
    const hold = pendingHold;
    if (!hold || isProcessingChat) return;
    setPendingHold(null);
    setIsProcessingChat(true);
    sunnyBrain.addMessage("user", answer === "yes" ? "Yes" : "No", "command");
    try {
      const result = await sunnyBrain.invokeTool("confirm_action", { token: hold.token, answer });
      const decision = unwrapToolResult(result) as { ok?: boolean; response?: string };
      const message = decision.response || (result.success ? "Done." : "That could not be completed.");
      sunnyBrain.addMessage("assistant", message, "command");
    } catch (e) {
      sunnyBrain.addMessage("system", "Error: " + describeError(e), "command");
    } finally {
      setIsProcessingChat(false);
      setActiveJob(null);
    }
  }, [pendingHold, describeError, isProcessingChat]);

  /** Stop the running computer-use job. */
  const handleStopJob = useCallback(async () => {
    try {
      await window.sunnyDesktop?.cancelActions?.();
      sunnyBrain.addMessage("system", "Sunny is stopping that job.", "command");
    } catch {
      sunnyBrain.addMessage("system", "Sunny could not stop that job.", "command");
    }
    setActiveJob(null);
  }, []);

  /** Remove a saved routine from the main process and refresh the list. */
  const handleDeleteRoutine = useCallback(async (phrase: string) => {
    try {
      const result = await window.sunnyDesktop?.deleteRoutine?.(phrase);
      if (result?.deleted) {
        setRoutines((current) => current.filter((item) => item.phrase !== phrase));
        sunnyBrain.addMessage("system", `Forgot the routine "${phrase}".`, "event");
      }
    } catch {
      sunnyBrain.addMessage("system", "Sunny could not remove that routine.", "event");
    }
  }, []);

  const handleSpeakDailyDigest = useCallback(async () => {
    if (!dailyDigest) return;
    try {
      sunnyBrain.addMessage("system", "Speaking the morning digest aloud…");
      const { location, unit } = getDigestWeatherParams();
      await sunnyBrain.speakDailyDigest(location, unit);
      sunnyBrain.addMessage("assistant", "Morning digest spoken aloud.");
    } catch {
      setDigestError("Sorry, I couldn't read the digest aloud just now. Please try again in a moment.");
      sunnyBrain.addMessage("system", "Sorry, I couldn't read the digest aloud just now. Please try again in a moment.");
    }
  }, [dailyDigest, describeError, getDigestWeatherParams]);

  const handleToggleHighContrast = useCallback(() => {
    setHighContrast((prev) => !prev);
    sunnyBrain.addMessage("system", `High contrast mode ${highContrast ? "disabled" : "enabled"}.`);
  }, [highContrast]);

  const handleRecipeSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleSearchRecipe();
  }, [handleSearchRecipe]);


  const batteryLevel = systemStatus?.battery?.batteryPercent ?? null;
  const isCharging = systemStatus?.battery?.isCharging ?? false;
  const wifiConnected = systemStatus?.wifi?.connected ?? false;
  const wifiName = systemStatus?.wifi?.networkName ?? null;
  const internetReachable = systemStatus?.internet?.reachable ?? false;
  const cpuUsage = systemStatus?.system?.cpuUsage ?? 0;
  const memoryGB = systemStatus?.system?.memoryAvailableGB ?? 0;

  const batteryStatus = useMemo(() => {
    if (batteryLevel === null) return { label: "Desktop (no battery)", level: "info" as const };
    if (batteryLevel < 20) return { label: batteryLevel + "% - Low", level: "critical" as const };
    if (batteryLevel < 50) return { label: batteryLevel + "% - Medium", level: "warning" as const };
    return { label: batteryLevel + "%" + (isCharging ? " (Charging)" : ""), level: "good" as const };
  }, [batteryLevel, isCharging]);

  const wifiStatus = useMemo(() => {
    if (!wifiConnected) return { label: "Disconnected", level: "critical" as const };
    return { label: "Connected: " + (wifiName ?? "Unknown"), level: "good" as const };
  }, [wifiConnected, wifiName]);

  const internetStatus = useMemo(() => ({
    label: internetReachable ? "Online" : "Offline",
    level: internetReachable ? ("good" as const) : ("critical" as const),
  }), [internetReachable]);

  const cpuStatus = useMemo(() => {
    const pct = Math.round(cpuUsage);
    if (pct > 80) return { label: pct + "% - High", level: "critical" as const };
    if (pct > 50) return { label: pct + "% - Moderate", level: "warning" as const };
    return { label: pct + "% - Normal", level: "good" as const };
  }, [cpuUsage]);

  const memoryStatus = useMemo(() => {
    if (memoryGB < 2) return { label: memoryGB.toFixed(1) + " GB - Low", level: "critical" as const };
    if (memoryGB < 4) return { label: memoryGB.toFixed(1) + " GB - Moderate", level: "warning" as const };
    return { label: memoryGB.toFixed(1) + " GB - Healthy", level: "good" as const };
  }, [memoryGB]);

  // The AI model is only needed for screen understanding; every other feature
  // (health, recipes, reminders, digest) works without it. Blocking the whole
  // app behind the fallback would hide working features from the user, so the
  // fallback is shown as a notice and the UI stays usable.
  const showOfflineFallback = modelStatus?.status === "error" || modelError !== null;
  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} />;
  }

  return (
    <>
      <ErrorBoundary>
        <>
          {showOfflineFallback && (
        <OfflineFallback
          onRetry={() => {
            setModelError(null);
            // Actually re-attempt the load. The progress subscription clears
            // modelError again if it fails, so a second failure still shows.
            void handleInitModel();
            sunnyBrain.getSystemStatus().then(setSystemStatus).catch(() => {});
          }}
          reason={modelError || "AI model is not available"}
        />
      )}
      {
        <>
          <div
            className={`app-shell ${highContrast ? 'high-contrast' : ''}${
              window.windowControls?.nativeTitleBar ? ' native-titlebar' : ''
            }${windowFilled ? ' letterboxed' : ''}`}
          >
            <header className="app-header" role="banner">
              <div className="header-left">
                <img src={mascot} alt="Sunny logo" className="app-logo" />
                <div>
                  <h1 className="app-title">Sunny</h1>
                  <p className="app-subtitle">Your Desktop Companion</p>
                </div>
              </div>
              <div className="header-right">
                <button
                  className="icon-btn"
                  onClick={handleToggleHighContrast}
                  aria-label={highContrast ? "Disable high contrast mode" : "Turn on high contrast mode"}
                  aria-pressed={highContrast}
                  title={highContrast ? "Disable high contrast" : "Turn on high contrast"}
                >
                  <Contrast size={24} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setShowWeather(!showWeather)}
                  aria-label={showWeather ? "Close weather" : "Open full weather"}
                  aria-expanded={showWeather}
                  title="Full weather"
                >
                  <CloudSun size={24} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => {
                    if (!showChat) setActiveView("chat");
                    setShowChat(!showChat);
                  }}
                  aria-label={showChat ? "Hide chat history" : "Show chat history"}
                  aria-pressed={showChat}
                >
                  <MessageSquare size={24} />
                </button>
                <span className="header-separator" aria-hidden="true" />
                {/* Window chrome. `no-drag` on the buttons so clicks register
                    instead of dragging the frameless window. */}
                <button
                  className={`icon-btn window-btn${alwaysOnTop ? " active" : ""}`}
                  onClick={handleToggleAlwaysOnTop}
                  aria-label={alwaysOnTop ? "Stop keeping Sunny on top" : "Keep Sunny on top"}
                  aria-pressed={alwaysOnTop}
                  title={alwaysOnTop ? "Stop keeping on top" : "Keep on top"}
                >
                  <Pin size={20} />
                </button>
                <button
                  className={`icon-btn window-btn${windowFilled ? " active" : ""}`}
                  onClick={handleToggleWindowFilled}
                  aria-label={windowFilled ? "Restore the Sunny window size" : "Make Sunny fill the screen"}
                  aria-pressed={windowFilled}
                  title={windowFilled ? "Restore window size" : "Fill the screen"}
                >
                  {windowFilled ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                {window.windowControls?.nativeTitleBar ? null : (
                  <>
                    <button
                      className="icon-btn window-btn window-btn-minimize"
                      onClick={handleMinimizeWindow}
                      aria-label="Minimize Sunny"
                      title="Minimize"
                    >
                      <Minimize2 size={20} />
                    </button>
                    <button
                      className="icon-btn window-btn window-btn-close"
                      onClick={handleCloseWindow}
                      aria-label="Close Sunny"
                      title="Close"
                    >
                      <XCircle size={20} />
                    </button>
                  </>
                )}
              </div>
            </header>
            <main className="app-main" role="main">
              {isBrowserPreview && (
                <div className="browser-preview-banner" role="note">
                  <span aria-hidden="true">⚠️</span>
                  <div>
                    <strong>You are previewing Sunny in a web browser.</strong>
                    <p>
                      The buttons below are disabled because they require the desktop app.
                      Download the free Sunny desktop app from{" "}
                      <a href="https://github.com/MT25MB/Sunny/releases/latest" target="_blank" rel="noopener noreferrer" style={{ color: "#ffd9a0" }}>
                        GitHub Releases
                      </a>{" "}
                      to check the computer health, set medication reminders, and hear spoken answers.
                    </p>
                  </div>
                </div>
              )}
                            <CollapsibleSection
                id="system-health"
                className="health-card"
                title="System Health"
                icon={<Shield size={20} />}
                mascotSrc={mascotStethoscope}
                open={openSections["system-health"]}
                onToggle={() => toggleSection("system-health")}
              >

                {isLoading && (
                  <div className="loading-state" aria-live="polite">
                    <RefreshCw size={24} className="spin" />
                    <span>Checking system health...</span>
                  </div>
                )}

                {error && (
                  <div className="error-banner" role="alert">
                    <AlertTriangle size={20} />
                    <span>{error}</span>
                    <button className="retry-btn" onClick={handleCheckHealth}>Retry</button>
                  </div>
                )}

                <div className="status-grid" role="list" aria-label="System health indicators">
                  <StatusItem
                    icon={<Battery size={24} />}
                    label="Battery"
                    value={batteryStatus.label}
                    level={batteryStatus.level}
                  />
                  <StatusItem
                    icon={<Wifi size={24} />}
                    label="Wi-Fi"
                    value={wifiStatus.label}
                    level={wifiStatus.level}
                  />
                  <StatusItem
                    icon={<Globe size={24} />}
                    label="Internet"
                    value={internetStatus.label}
                    level={internetStatus.level}
                  />
                  <StatusItem
                    icon={<Cpu size={24} />}
                    label="CPU"
                    value={cpuStatus.label}
                    level={cpuStatus.level}
                  />
                  <StatusItem
                    icon={<HardDrive size={24} />}
                    label="Memory"
                    value={memoryStatus.label}
                    level={memoryStatus.level}
                  />
                </div>

                <div className="last-updated" aria-live="polite">
                  Last updated: {systemStatus ? new Date(systemStatus.timestamp).toLocaleTimeString() : "not available"}
                </div>
              </CollapsibleSection>

                            <CollapsibleSection
                id="recipes"
                className="recipe-section"
                title="Recipes & Cooking"
                icon={<Utensils size={20} />}
                mascotSrc={mascotChef}
                open={openSections.recipes}
                onToggle={() => toggleSection("recipes")}
              >
                <form onSubmit={handleRecipeSearchSubmit} className="recipe-search-form">
                  <input
                    type="text"
                    value={recipeSearchQuery}
                    onChange={(e) => setRecipeSearchQuery(e.target.value)}
                    placeholder="Search for a recipe (e.g., chicken parmesan)..."
                    className="recipe-search-input"
                    disabled={isSearching}
                    aria-label="Recipe search query"
                  />
                  <button
                    type="submit"
                    className="recipe-search-btn"
                    disabled={isSearching || !recipeSearchQuery.trim()}
                  >
                    <Search size={20} />
                    {isSearching ? "Searching\u2026" : "Search"}
                  </button>
                  {recipeSearchError && (
                    <span className="recipe-search-error">{recipeSearchError}</span>
                  )}
                  {preferences.voice_enabled && (
                    <MicButton
                      disabled={isSearching}
                      onTranscript={(text) => setRecipeSearchQuery(text)}
                    />
                  )}
                </form>

                {searchResults.length > 0 && (
                  <div className="recipe-results" role="list" aria-label="Recipe search results">
                    {searchResults.map((recipe) => (
                      <article key={recipe.id} className="recipe-card" role="listitem">
                        <div className="recipe-card-header">
                          <h3 className="recipe-title">{recipe.title}</h3>
                          <span className="recipe-meta">
                            <span>&#9201; {recipe.prepTimeMinutes + recipe.cookTimeMinutes} min</span>
                            <span>&#128101; {recipe.servings} servings</span>
                          </span>
                        </div>
                        <div className="recipe-preview">
                          <p className="recipe-ingredients">Ingredients: {recipe.ingredients.slice(0, 3).join(", ")}{recipe.ingredients.length > 3 ? "..." : ""}</p>
                        </div>
                        <button
                          className="recipe-select-btn"
                          onClick={() => handleSelectRecipe(recipe)}
                          aria-label={`Start cooking ${recipe.title}`}
                        >
                          <Utensils size={16} /> Start Cooking
                        </button>
                      </article>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && (
                  <div className="section-mascot-hint">
                    <img
                      src={mascotChef}
                      alt=""
                      className="section-mascot"
                      aria-hidden="true"
                    />
                    <p className="section-mascot-caption">
                      Search for a recipe and Sunny will read every step out loud, one giant screen at a time.
                    </p>
                  </div>
                )}
              </CollapsibleSection>
              {cookingMode && (
                <div className="cooking-mode-overlay" role="dialog" aria-modal="true" aria-labelledby="cooking-title">
                  <div className="cooking-mode-content">
                    <header className="cooking-header">
                      <h2 id="cooking-title" className="cooking-title">{cookingMode.recipe.title}</h2>
                      <button
                        className="cooking-close-btn"
                        onClick={handleExitCookingMode}
                        aria-label="Exit cooking mode"
                      >
                        <XCircle size={24} />
                      </button>
                    </header>

                    <div className="cooking-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${((cookingMode.currentStep + 1) / cookingMode.recipe.instructions.length) * 100}%` }}
                        />
                      </div>
                      <span className="progress-text">
                        Step {cookingMode.currentStep + 1} of {cookingMode.recipe.instructions.length}
                      </span>
                    </div>

                    <div className="cooking-step" role="article" aria-label={`Step ${cookingMode.currentStep + 1}`}>
                      <p className="step-instruction">{cookingMode.recipe.instructions[cookingMode.currentStep]}</p>
                    </div>

                    <div className="cooking-controls">
                      <button
                        className="cooking-btn cooking-btn-secondary"
                        onClick={handlePreviousStep}
                        disabled={cookingMode.currentStep === 0}
                        aria-label="Previous step"
                      >
                        <ChevronLeft size={24} /> Previous
                      </button>
                      <button
                        className="cooking-btn cooking-btn-primary"
                        onClick={cookingMode.currentStep < cookingMode.recipe.instructions.length - 1 ? handleNextStep : handleExitCookingMode}
                        aria-label={cookingMode.currentStep < cookingMode.recipe.instructions.length - 1 ? "Next step" : "Finish cooking"}
                      >
                        {cookingMode.currentStep < cookingMode.recipe.instructions.length - 1 ? (
                          <>Next <ChevronRight size={24} /></>
                        ) : (
                          <>Finish <Check size={24} /></>
                        )}
                      </button>
                    </div>

                    <div className="cooking-tts">
                      <button
                        className="tts-btn"
                        onClick={() => {
                          const text = `Step ${cookingMode.currentStep + 1}: ${cookingMode.recipe.instructions[cookingMode.currentStep]}`;
                          sunnyBrain.speakNotification(text, "normal", 1);
                        }}
                        aria-label="Read current step aloud"
                      >
                        <Volume2 size={20} /> Read Step Aloud
                      </button>
                      <button
                        className="tts-btn tts-btn-secondary"
                        onClick={() => {
                          const text = `Step ${cookingMode.currentStep + 1}: ${cookingMode.recipe.instructions[cookingMode.currentStep]}`;
                          sunnyBrain.speakNotification(text, "normal", 1);
                        }}
                        aria-label="Repeat current step"
                      >
                        <RotateCcw size={20} /> Repeat Step
                      </button>
                    </div>
                  </div>
                </div>
              )}

                            <CollapsibleSection
                id="medication"
                className="medication-section"
                title="Medication Reminders"
                icon={<Pill size={20} />}
                mascotSrc={mascotPills}
                open={openSections.medication}
                onToggle={() => toggleSection("medication")}
                headerExtra={
                  <button className="add-medication-btn" onClick={() => setMedModal({ open: true, pillName: "", timeString: "", error: null })}>
                    <Plus size={20} /> Add Reminder
                  </button>
                }
              >

                {medModal.open && (
                  <div className="med-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="med-modal-title">
                    <div className="med-modal">
                      <h3 id="med-modal-title">Add Medication Reminder</h3>
                      <label>
                        Medication name
                        <input
                          type="text"
                          value={medModal.pillName}
                          onChange={(e) => setMedModal((m) => ({ ...m, pillName: e.target.value, error: null }))}
                          placeholder="e.g. Vitamin D"
                        />
                      </label>
                      <label>
                        Time (HH:MM, 24-hour)
                        <input
                          type="text"
                          value={medModal.timeString}
                          onChange={(e) => setMedModal((m) => ({ ...m, timeString: e.target.value, error: null }))}
                          placeholder="08:30"
                        />
                      </label>
                      {medModal.error && (
                        <span className="med-modal-error">{medModal.error}</span>
                      )}
                      <div className="med-modal-actions">
                        <button className="medication-btn" onClick={() => setMedModal({ open: false, pillName: "", timeString: "", error: null })}>
                          Cancel
                        </button>
                        <button
                          className="medication-btn taken-btn"
                          onClick={() => {
                            const name = medModal.pillName.trim();
                            const time = medModal.timeString.trim();
                            if (!name) return;
                            if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
                              alert("Invalid time format. Use HH:MM (24-hour).");
                              return;
                            }
                            handleScheduleMedication(name, time);
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="medication-list" role="list" aria-label="Medication reminders">
                  {medicationReminders.length === 0 ? (
                    <div className="section-mascot-hint">
                      <img
                        src={mascotPills}
                        alt=""
                        className="section-mascot"
                        aria-hidden="true"
                      />
                      <p className="section-mascot-caption">
                        No medication reminders set yet. Add one above and Sunny will call it out loud at the right time.
                      </p>
                    </div>
                  ) : (
                    medicationReminders.map((reminder) => (
                      <article key={reminder.id} className={`medication-card ${reminder.enabled ? "active" : "taken"}`} role="listitem">
                        <div className="medication-info">
                          <h3 className="medication-name">{reminder.pillName}</h3>
                          <div className="medication-meta">
                            <span className="medication-time">
                              <Clock size={14} /> {reminder.timeString}
                            </span>
                            <span className={`medication-status ${reminder.enabled ? "active" : "taken"}`}>
                              {reminder.enabled ? "? Active" : "? Taken"}
                            </span>
                          </div>
                        </div>
                        <div className="medication-actions">
                          {reminder.enabled ? (
                            <button
                              className="medication-btn taken-btn"
                              onClick={() => handleMedicationTaken(reminder.id)}
                              aria-label={`Mark ${reminder.pillName} as taken`}
                            >
                              <Check size={18} /> I Took It
                            </button>
                          ) : (
                            <span className="taken-badge">? Taken</span>
                          )}
                          <button
                            className="medication-btn delete-btn"
                            onClick={() => handleDeleteMedication(reminder.id)}
                            aria-label={`Delete ${reminder.pillName} reminder`}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </CollapsibleSection>
                            <CollapsibleSection
                id="digest"
                className="digest-section"
                title="Morning Digest"
                icon={<Newspaper size={20} />}
                mascotSrc={mascotNewspaper}
                open={openSections.digest}
                onToggle={() => toggleSection("digest")}
              >
                <div className="digest-content">
                  {digestError && (
                    <div className="error-banner" role="alert">
                      <AlertTriangle size={20} />
                      <span>{digestError}</span>
                      <button
                        className="retry-btn"
                        onClick={handleFetchDailyDigest}
                        disabled={isFetchingDigest}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {dailyDigest ? (
                    <div className="digest-display">
                      <div className="digest-weather">
                        <h3>
                          {dailyDigest.weather.isDay === false ? <Moon size={18} /> : <Sun size={18} />} Weather
                        </h3>
                        <p className="weather-main">
                          <span className="temp">{dailyDigest.weather.temperature}°C</span>
                          <span className="condition">{dailyDigest.weather.condition}</span>
                        </p>
                        <p className="weather-location">{dailyDigest.weather.location}</p>
                        <div className="weather-details">
                          {dailyDigest.weather.feelsLike !== undefined && (
                            <div className="weather-detail">
                              <Thermometer size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">Feels Like</span>
                              <span className="detail-value">{dailyDigest.weather.feelsLike}°C</span>
                            </div>
                          )}
                          {dailyDigest.weather.humidity !== undefined && (
                            <div className="weather-detail">
                              <Droplets size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">Humidity</span>
                              <span className="detail-value">{dailyDigest.weather.humidity}%</span>
                            </div>
                          )}
                          {dailyDigest.weather.windSpeed !== undefined && (
                            <div className="weather-detail">
                              <Wind size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">Wind</span>
                              <span className="detail-value">
                                {dailyDigest.weather.windSpeed} km/h{dailyDigest.weather.windDirection ? ` ${dailyDigest.weather.windDirection}` : ""}
                              </span>
                            </div>
                          )}
                          {dailyDigest.weather.windGust !== undefined && (
                            <div className="weather-detail">
                              <Wind size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">Gusts</span>
                              <span className="detail-value">{dailyDigest.weather.windGust} km/h</span>
                            </div>
                          )}
                          {dailyDigest.weather.precipitationChance !== undefined && (
                            <div className="weather-detail">
                              <CloudRain size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">Chance of Rain</span>
                              <span className="detail-value">{dailyDigest.weather.precipitationChance}%</span>
                            </div>
                          )}
                          {dailyDigest.weather.uvIndex !== undefined && (
                            <div className="weather-detail">
                              <Sun size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">UV Index</span>
                              <span className="detail-value">{dailyDigest.weather.uvIndex} ({uvIndexLabel(dailyDigest.weather.uvIndex)})</span>
                            </div>
                          )}
                          {dailyDigest.weather.high !== undefined && dailyDigest.weather.low !== undefined && (
                            <div className="weather-detail">
                              <ArrowUpDown size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">High / Low</span>
                              <span className="detail-value">{dailyDigest.weather.high}° / {dailyDigest.weather.low}°</span>
                            </div>
                          )}
                          {dailyDigest.weather.pressure !== undefined && (
                            <div className="weather-detail">
                              <Gauge size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">Pressure</span>
                              <span className="detail-value">{dailyDigest.weather.pressure} hPa</span>
                            </div>
                          )}
                          {dailyDigest.weather.visibility !== undefined && (
                            <div className="weather-detail">
                              <Eye size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">Visibility</span>
                              <span className="detail-value">{dailyDigest.weather.visibility} km</span>
                            </div>
                          )}
                          {dailyDigest.weather.sunrise && dailyDigest.weather.sunset && (
                            <div className="weather-detail">
                              <Sunrise size={18} className="detail-icon" aria-hidden="true" />
                              <span className="detail-label">Sunrise / Sunset</span>
                              <span className="detail-value">
                                {new Date(dailyDigest.weather.sunrise).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} /{" "}
                                {new Date(dailyDigest.weather.sunset).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="digest-news">
                        <h3><Newspaper size={18} /> Top News</h3>
                        {dailyDigest.news.length > 0 ? (
                          <ul className="news-list">
                            {dailyDigest.news.slice(0, 5).map((item, index) => (
                              <li key={index} className="news-item">
                                {item.imageUrl && (
                                  <img src={item.imageUrl} alt="" className="news-image" loading="lazy" />
                                )}
                                <div className="news-content">
                                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="news-title">
                                    {item.title}
                                  </a>
                                  {item.source && (
                                    <span className="news-source">{item.source}</span>
                                  )}
                                  {item.publishedAt && (
                                    <time className="news-date" dateTime={item.publishedAt}>
                                      {new Date(item.publishedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                                    </time>
                                  )}
                                  {item.summary && <p className="news-summary">{item.summary}</p>}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="no-news">No news available at this time.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="section-mascot-hint">
                      <img
                        src={mascotNewspaper}
                        alt=""
                        className="section-mascot"
                        aria-hidden="true"
                      />
                      <p className="section-mascot-caption">
                        Press the button below and Sunny will bring you today&apos;s weather and the top headlines.
                      </p>
                    </div>
                  )}
                </div>
                <div className="digest-actions">
                  <button
                    className="digest-btn primary"
                    onClick={handleFetchDailyDigest}
                    disabled={isFetchingDigest}
                  >
                    <RefreshCw size={18} className={isFetchingDigest ? "spin" : ""} />
                    {isFetchingDigest ? "Fetching..." : "Fetch Morning Digest"}
                  </button>
                  {dailyDigest && (
                    <button
                      className="digest-btn secondary"
                      onClick={handleSpeakDailyDigest}
                    >
                      <Volume2 size={18} /> Speak Digest Aloud
                    </button>
                  )}
                </div>
              </CollapsibleSection>

              {showChat && (
                <section id="activity" className="workspace" aria-label="Sunny workspace">
                  <div className="workspace-head">
                    <div className="workspace-heading">
                      <span className="workspace-heading-icon"><Sparkles size={20} /></span>
                      <div>
                        <h2>Sunny's Workspace</h2>
                        <p>Talk to Sunny, give it tasks, and see what it has done.</p>
                      </div>
                    </div>
                    <div className="workspace-tabs" role="tablist" aria-label="Workspace sections">
                      <button
                        id="activity-toggle"
                        type="button"
                        role="tab"
                        aria-selected={activeView === "chat"}
                        className={`workspace-tab${activeView === "chat" ? " active" : ""}`}
                        onClick={() => setActiveView("chat")}
                      >
                        <MessageSquare size={18} /> Chat
                        {chatMessages.length > 0 && <span className="tab-count">{chatMessages.length}</span>}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeView === "commands"}
                        className={`workspace-tab${activeView === "commands" ? " active" : ""}`}
                        onClick={() => setActiveView("commands")}
                      >
                        <Terminal size={18} /> Commands
                        {commandMessages.length > 0 && <span className="tab-count">{commandMessages.length}</span>}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeView === "activity"}
                        className={`workspace-tab${activeView === "activity" ? " active" : ""}`}
                        onClick={() => setActiveView("activity")}
                      >
                        <ScrollText size={18} /> Activity Log
                        {activityMessages.length > 0 && <span className="tab-count">{activityMessages.length}</span>}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeView === "routines"}
                        className={`workspace-tab${activeView === "routines" ? " active" : ""}`}
                        onClick={() => setActiveView("routines")}
                      >
                        <Bookmark size={18} /> Routines
                        {routines.length > 0 && <span className="tab-count">{routines.length}</span>}
                      </button>
                    </div>
                  </div>

                  {activeJob && (
                    <div className="job-progress" role="status" aria-live="polite">
                      <div className="job-progress-body">
                        <strong>Sunny is working on a job</strong>
                        <p>Step {activeJob.step} of {activeJob.total}: {activeJob.label}</p>
                      </div>
                      <button type="button" className="job-stop" onClick={() => void handleStopJob()}>
                        <Square size={15} fill="currentColor" /> Stop
                      </button>
                    </div>
                  )}

                  {pendingHold && (
                    <div className="hold-prompt" role="alertdialog" aria-label="Permission needed">
                      <div className="hold-prompt-icon"><Shield size={22} aria-hidden="true" /></div>
                      <div className="hold-prompt-body">
                        <strong>Sunny needs your permission</strong>
                        <p>{pendingHold.question}</p>
                        <div className="hold-prompt-actions">
                          <button type="button" className="hold-no" onClick={() => void handleHoldAnswer("no")} disabled={isProcessingChat}>No, cancel</button>
                          <button type="button" className="hold-yes" onClick={() => void handleHoldAnswer("yes")} disabled={isProcessingChat}>Yes, go ahead</button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="workspace-panel" role="tabpanel">
                    {activeView === "chat" && (
                      <div className="chat-section">
                        <div className="section-intro">
                          <h3>Chat with Sunny</h3>
                          <p>Ask anything in your own words — Sunny replies here.</p>
                        </div>
                        <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation history">
                          {chatMessages.length === 0 ? (
                            <div className="workspace-empty">
                              <img src={mascotMagnifying} alt="" className="workspace-empty-mascot" />
                              <p className="chat-empty">No conversation yet. Ask Sunny anything below.</p>
                            </div>
                          ) : (
                            chatMessages.map((msg) => <ChatMessageItem key={msg.id} message={msg} />)
                          )}
                          <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={handleChatSubmit} className="chat-input-form">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder='Type a command (e.g., "open calculator") or ask a question...'
                            className="chat-input"
                            disabled={isProcessingChat}
                            aria-label="Chat input"
                          />
                          <button
                            type="submit"
                            className="chat-send-btn"
                            disabled={!chatInput.trim() || isProcessingChat}
                            aria-label="Send command"
                          >
                            <Send size={18} />
                          </button>
                        </form>
                      </div>
                    )}

                    {activeView === "commands" && (
                      <div className="commands-section">
                        <div className="section-intro section-intro-with-mascot">
                          <div>
                            <h3>Tell Sunny what to do</h3>
                            <p>Type a task and Sunny works out the steps on your computer.</p>
                          </div>
                          <img src={mascotMicrophone} alt="" className="section-intro-mascot" />
                        </div>
                        <form onSubmit={handleCommandSubmit} className="command-input-form">
                          <Terminal size={20} aria-hidden="true" />
                          <input
                            type="text"
                            value={commandInput}
                            onChange={(e) => setCommandInput(e.target.value)}
                            placeholder="Tell Sunny to do something (e.g. open calculator)"
                            className="command-input"
                            disabled={isProcessingChat}
                            aria-label="Computer task"
                          />
                          <button
                            type="submit"
                            className="command-run-btn"
                            disabled={!commandInput.trim() || isProcessingChat}
                            aria-label="Run command"
                          >
                            <Send size={17} /> Run
                          </button>
                        </form>
                        <div id="quick-actions" className="action-grid">
                          <ActionButton
                            icon={<RefreshCw size={28} />}
                            label="Check System Health"
                            description="Run a fresh health check now"
                            onClick={handleCheckHealth}
                            disabled={isLoading}
                            primary
                          />
                          <ActionButton
                            icon={isSpeaking ? <VolumeX size={28} /> : <Volume2 size={28} />}
                            label="Speak Status Aloud"
                            description="Hear your system status spoken"
                            onClick={handleSpeakStatus}
                            disabled={!systemStatus || isSpeaking}
                            loading={isSpeaking}
                          />
                          <ActionButton
                            icon={<Trash2 size={28} />}
                            label="Clear Chat History"
                            description="Remove all messages below"
                            onClick={handleClearChat}
                            variant="secondary"
                          />
                          <ActionButton
                            icon={<Settings size={28} />}
                            label="Open Settings"
                            description="Adjust voice, speed, and AI model"
                            onClick={() => setShowSettings(true)}
                            variant="secondary"
                          />
                        </div>
                        <div className="command-history">
                          <h4>Recent tasks</h4>
                          {commandMessages.length === 0 ? (
                            <p className="workspace-empty-note">No tasks yet. Type one above or press a button.</p>
                          ) : (
                            commandMessages.map((msg) => (
                              <ChatMessageItem key={msg.id} message={msg} />
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeView === "activity" && (
                      <div className="activity-section">
                        <div className="section-intro">
                          <h3>What Sunny has done</h3>
                          <p>A timeline of checks, actions, and reminders.</p>
                        </div>
                        <div className="activity-timeline" role="log" aria-live="polite">
                          {activityMessages.length === 0 ? (
                            <p className="workspace-empty-note">Nothing to show yet. Sunny's actions will appear here.</p>
                          ) : (
                            activityMessages.map((msg) => (
                              <div className="activity-entry" key={msg.id}>
                                <span className={`activity-dot${msg.role === "system" ? " warning" : ""}`} aria-hidden="true" />
                                <div className="activity-entry-body">
                                  <p>{msg.content}</p>
                                  <time dateTime={msg.timestamp.toISOString()}>
                                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </time>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeView === "routines" && (
                      <div className="routines-section">
                        <div className="section-intro">
                          <h3>Saved routines</h3>
                          <p>Repeating jobs you have taught Sunny. Ask Sunny to "remember a routine" to add one.</p>
                        </div>
                        {routines.length === 0 ? (
                          <p className="workspace-empty-note">
                            No routines yet. Say something like: remember a routine for opening Notepad and typing hello.
                          </p>
                        ) : (
                          <ul className="routine-list">
                            {routines.map((routine) => (
                              <li className="routine-card" key={routine.phrase}>
                                <div className="routine-card-body">
                                  <strong>{routine.phrase}</strong>
                                  <ol>
                                    {routine.steps.map((step, index) => (
                                      <li key={index}>{step}</li>
                                    ))}
                                  </ol>
                                </div>
                                <div className="routine-card-actions">
                                  <button
                                    type="button"
                                    className="routine-run"
                                    onClick={() => {
                                      setActiveView("commands");
                                      setCommandInput(`Run the routine ${routine.phrase}`);
                                    }}
                                  >
                                    Run
                                  </button>
                                  <button
                                    type="button"
                                    className="routine-delete"
                                    aria-label={`Delete routine ${routine.phrase}`}
                                    onClick={() => void handleDeleteRoutine(routine.phrase)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <Footer />
            </main>
          </div>
        </>
      }
      {medicationPopup && (
        <div
          className="medication-popup-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="medication-popup-title"
          aria-describedby="medication-popup-desc"
        >
          <div className="medication-popup-card">
            <div className="medication-popup-icon" aria-hidden="true">
              <Pill size={64} strokeWidth={1.6} />
            </div>
            <p className="medication-popup-eyebrow">Medication Reminder</p>
            <h2 id="medication-popup-title" className="medication-popup-title">Time to take</h2>
            <p id="medication-popup-desc" className="medication-popup-name">{medicationPopup.pillName}</p>
            <p className="medication-popup-time">Scheduled for {medicationPopup.timeString}</p>
            <div className="medication-popup-actions">
              <button
                type="button"
                className="medication-popup-btn taken-btn"
                autoFocus
                onClick={() => {
                  void handleMedicationTaken(medicationPopup.id);
                  setMedicationPopup(null);
                }}
              >
                <Check size={22} aria-hidden="true" /> I&rsquo;ve taken it
              </button>
              <button
                type="button"
                className="medication-popup-btn secondary-btn"
                onClick={() => setMedicationPopup(null)}
              >
                Not now
              </button>
            </div>
            <p className="medication-popup-hint">This reminder repeats every day at the same time.</p>
          </div>
        </div>
      )}
      {showWeather && (
        <div
          className="weather-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Full weather forecast"
          onClick={(e) => { if (e.target === e.currentTarget) setShowWeather(false); }}
        >
          <button
            type="button"
            className="weather-overlay-close"
            onClick={() => setShowWeather(false)}
            aria-label="Close weather"
          >
            <X size={28} />
          </button>
          <WeatherPanel onClose={() => setShowWeather(false)} />
        </div>
      )}
      {showSettings && (
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          preferences={preferences}
          onUpdate={handlePreferencesUpdate}
          onReset={handlePreferencesReset}
          modelStatus={modelStatus ?? { status: 'not-downloaded', progress: 0, message: 'Model not loaded yet.' }}
          debugLogCount={debugLogCount}
          onClearLogs={handleClearLogs}
          onExportLogs={handleExportLogs}
          onInitModel={handleInitModel}
          autoCheckUpdates={autoCheckUpdates}
          onAutoCheckUpdatesChange={handleAutoCheckUpdatesChange}
        />
      )}
      {showOnboarding && (
        <OnboardingScreen
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
    </>
      </ErrorBoundary>
      <UpdateToast onRestart={() => {
        if (window.electronAPI?.quitAndInstall) {
          void window.electronAPI.quitAndInstall();
        }
      }} />
    </>
  );
}

type StatusLevel = "good" | "warning" | "critical" | "info";

interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  level: StatusLevel;
}

function StatusItem({ icon, label, value, level }: StatusItemProps) {
  const levelColors: Record<StatusLevel, string> = {
    good: "status-good",
    warning: "status-warning",
    critical: "status-critical",
    info: "status-info",
  };
  const icons = {
    good: <CheckCircle size={16} />,
    warning: <AlertTriangle size={16} />,
    critical: <XCircle size={16} />,
    info: <CheckCircle size={16} />,
  };

  return (
    <article className={"status-item " + levelColors[level]} role="listitem">
      <div className="status-icon">{icon}</div>
      <div className="status-content">
        <span className="status-label">{label}</span>
        <span className="status-value">{value}</span>
      </div>
      <div className="status-indicator" aria-hidden="true">
        {icons[level]}
      </div>
    </article>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  primary?: boolean;
  variant?: "primary" | "secondary";
}

function ActionButton({ icon, label, description, onClick, disabled, loading, primary = false, variant = "primary" }: ActionButtonProps) {
  return (
    <button
      className={Array.from(
        new Set(
          ["action-btn", variant, primary ? "primary" : null, loading ? "loading" : null].filter(
            Boolean
          ) as string[]
        )
      ).join(" ")}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-disabled={disabled || loading}
    >
      <span className="btn-icon" aria-hidden="true">{icon}</span>
      <div className="btn-text">
        <span className="btn-label" style={{ color: "#f7f9fb" }}>{label}</span>
        <span className="btn-desc" style={{ color: "#829298" }}>{description}</span>
      </div>
      {loading && <span className="btn-spinner" aria-label="Loading" />}
    </button>
  );
}

function ChatMessageItem({ message }: { message: ChatMessage }) {
  const time = message.timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const isSystem = message.role === "system";

  return (
    <article className={"chat-msg " + message.role + " " + (isSystem ? "system" : "")}>
      {!isSystem && <span className="msg-role" aria-hidden="true">
        {message.role === "user" ? "You" : "Sunny"}
      </span>}
      <div className="msg-content">
        <p className="msg-text">{message.content}</p>
        <time className="msg-time" dateTime={message.timestamp.toISOString()}>{time}</time>
      </div>
    </article>
  );
}

function formatStatusForSpeech(status: SystemStatus): string {
  const parts: string[] = [];
  const battery = status.battery?.batteryPercent;
  if (typeof battery === "number") {
    parts.push("Battery at " + battery + " percent" + (status.battery?.isCharging ? " and charging" : "."));
  }
  if (status.wifi?.connected) {
    parts.push("Wi-Fi connected to " + (status.wifi.networkName ?? "a network") + ".");
  } else {
    parts.push("Wi-Fi is disconnected.");
  }
  parts.push(status.internet?.reachable ? "Internet is reachable." : "Internet is not reachable.");
  parts.push("CPU usage is " + Math.round(status.system?.cpuUsage ?? 0) + " percent.");
  parts.push("Available memory is " + (status.system?.memoryAvailableGB ?? 0).toFixed(1) + " gigabytes.");
  return parts.join(" ");
}

export default App;
