/**
 * UNIT TESTS: App.tsx component wiring (content-based)
 * Tests for src/App.tsx
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.tsx'), 'utf8');

// ============================================================================
// Imports
// ============================================================================

test('imports: imports sunnyBrain from renderer services', () => {
  assert.ok(APP.includes('import { sunnyBrain, type ChatMessage } from "@/renderer/services/sunnyBrain";'));
});

test('imports: imports SystemStatus type', () => {
  assert.ok(APP.includes('import type { SystemStatus, Recipe, DailyDigest } from "@/types/electron";'));
});

test('imports: imports ModelStatus type', () => {
  assert.ok(APP.includes('import type { ModelStatus } from "@/vite-env";'));
});

test('imports: imports local preferences', () => {
  assert.ok(APP.includes('from "@/lib/local-preferences";'));
});

test('imports: imports section state', () => {
  assert.ok(APP.includes('from "@/lib/section-state";'));
});

test('imports: imports ErrorBoundary component', () => {
  assert.ok(APP.includes('import ErrorBoundary from "@/components/ErrorBoundary";'));
});

test('imports: imports OfflineFallback component', () => {
  assert.ok(APP.includes('import OfflineFallback from "@/components/OfflineFallback";'));
});

test('imports: imports Footer component', () => {
  assert.ok(APP.includes('import Footer from "@/components/Footer";'));
});

test('imports: imports SettingsModal component', () => {
  assert.ok(APP.includes('import { SettingsModal } from "@/components/SettingsModal";'));
});

test('imports: imports OnboardingScreen component', () => {
  assert.ok(APP.includes('import { OnboardingScreen } from "@/components/OnboardingScreen";'));
});

test('imports: imports UpdateToast component', () => {
  assert.ok(APP.includes('import { UpdateToast } from "@/components/UpdateToast";'));
});

test('imports: imports MicButton component', () => {
  assert.ok(APP.includes('import { MicButton } from "@/components/MicButton";'));
});

test('imports: imports CollapsibleSection component', () => {
  assert.ok(APP.includes('import CollapsibleSection from "@/components/CollapsibleSection";'));
});

// ============================================================================
// State variables
// ============================================================================

test('state: defines systemStatus state', () => {
  assert.ok(APP.includes('const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);'));
});

test('state: defines messages state', () => {
  assert.ok(APP.includes('const [messages, setMessages] = useState<ChatMessage[]>([]);'));
});

test('state: defines isSpeaking state', () => {
  assert.ok(APP.includes('const [isSpeaking, setIsSpeaking] = useState(false);'));
});

test('state: defines highContrast state', () => {
  assert.ok(APP.includes('const [highContrast, setHighContrast] = useState(false);'));
});

test('state: defines cookingMode state', () => {
  assert.ok(APP.includes('const [cookingMode, setCookingMode] = useState<{ recipe: Recipe; currentStep: number } | null>(null);'));
});

test('state: defines medicationReminders state', () => {
  assert.ok(APP.includes('const [medicationReminders, setMedicationReminders] = useState<'));
});

test('state: defines dailyDigest state', () => {
  assert.ok(APP.includes('const [dailyDigest, setDailyDigest] = useState<DailyDigest | null>(null);'));
});

test('state: defines digestError state', () => {
  assert.ok(APP.includes('const [digestError, setDigestError] = useState<string | null>(null);'));
});

test('state: defines isFetchingDigest state', () => {
  assert.ok(APP.includes('const [isFetchingDigest, setIsFetchingDigest] = useState(false);'));
});

test('state: defines recipeSearchQuery state', () => {
  assert.ok(APP.includes('const [recipeSearchQuery, setRecipeSearchQuery] = useState("");'));
});

test('state: defines searchResults state', () => {
  assert.ok(APP.includes('const [searchResults, setSearchResults] = useState<Recipe[]>([]);'));
});

test('state: defines isSearching state', () => {
  assert.ok(APP.includes('const [isSearching, setIsSearching] = useState(false);'));
});

test('state: defines modelStatus state', () => {
  assert.ok(APP.includes('const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);'));
});

test('state: defines preferences state', () => {
  assert.ok(APP.includes('const [preferences, setPreferences] = useState<SunnyPreferences>(defaultPreferences);'));
});

test('state: defines chatInput state', () => {
  assert.ok(APP.includes('const [chatInput, setChatInput] = useState("");'));
});

test('state: defines isProcessingChat state', () => {
  assert.ok(APP.includes('const [isProcessingChat, setIsProcessingChat] = useState(false);'));
});

test('state: defines showSettings state', () => {
  assert.ok(APP.includes('const [showSettings, setShowSettings] = useState(false);'));
});

test('state: defines showOnboarding state', () => {
  assert.ok(APP.includes('const [showOnboarding, setShowOnboarding] = useState(false);'));
});

// ============================================================================
// Subscriptions
// ============================================================================

test('subscriptions: subscribes to system status changes', () => {
  assert.ok(APP.includes('sunnyBrain.onSystemStatusChange((status) => {'));
});

test('subscriptions: subscribes to messages', () => {
  assert.ok(APP.includes('sunnyBrain.subscribe((msgs) => {'));
});

test('subscriptions: subscribes to medication reminders', () => {
  assert.ok(APP.includes('sunnyBrain.onMedicationReminder((reminder) => {'));
});

test('subscriptions: subscribes to medication reminders added', () => {
  assert.ok(APP.includes('sunnyBrain.onMedicationReminderAdded((reminder) => {'));
});

test('subscriptions: subscribes to cooking step changes', () => {
  assert.ok(APP.includes('sunnyBrain.onCookingStepChange((step) => {'));
});

test('subscriptions: unsubscribes on cleanup', () => {
  assert.ok(APP.includes('statusUnsubscribeRef.current?.();'));
  assert.ok(APP.includes('messagesUnsubscribeRef.current?.();'));
  assert.ok(APP.includes('medicationUnsubscribeRef.current?.();'));
  assert.ok(APP.includes('medicationAddedUnsubscribeRef.current?.();'));
  assert.ok(APP.includes('cookingStepUnsubscribeRef.current?.();'));
});

// ============================================================================
// Health check handlers
// ============================================================================

test('handlers: defines handleCheckHealth', () => {
  assert.ok(APP.includes('const handleCheckHealth = useCallback(async () => {'));
});

test('handlers: handleCheckHealth calls getSystemStatus', () => {
  assert.ok(APP.includes('const status = await sunnyBrain.getSystemStatus();'));
});

test('handlers: defines handleSpeakStatus', () => {
  assert.ok(APP.includes('const handleSpeakStatus = useCallback(async () => {'));
});

test('handlers: handleSpeakStatus calls speakNotification', () => {
  assert.ok(APP.includes('await sunnyBrain.speakNotification(text, "normal", 1);'));
});

test('handlers: defines handleClearChat', () => {
  assert.ok(APP.includes('const handleClearChat = useCallback(() => {'));
});

test('handlers: handleClearChat calls clearMessages', () => {
  assert.ok(APP.includes('sunnyBrain.clearMessages();'));
});

// ============================================================================
// Recipe handlers
// ============================================================================

test('handlers: defines handleSearchRecipe', () => {
  assert.ok(APP.includes('const handleSearchRecipe = useCallback(async () => {'));
});

test('handlers: handleSearchRecipe calls triggerQuickAction recipe', () => {
  assert.ok(APP.includes("sunnyBrain.triggerQuickAction('recipe', {"));
});

test('handlers: defines handleSelectRecipe', () => {
  assert.ok(APP.includes('const handleSelectRecipe = useCallback((recipe: Recipe) => {'));
});

test('handlers: handleSelectRecipe expands recipes section', () => {
  assert.ok(APP.includes('expandSection("recipes");'));
});

test('handlers: defines handleNextStep', () => {
  assert.ok(APP.includes('const handleNextStep = useCallback(() => {'));
});

test('handlers: defines handlePreviousStep', () => {
  assert.ok(APP.includes('const handlePreviousStep = useCallback(() => {'));
});

test('handlers: defines handleExitCookingMode', () => {
  assert.ok(APP.includes('const handleExitCookingMode = useCallback(() => {'));
});

// ============================================================================
// Medication handlers
// ============================================================================

test('handlers: defines handleScheduleMedication', () => {
  assert.ok(APP.includes('const handleScheduleMedication = useCallback(async (pillName: string, timeString: string) => {'));
});

test('handlers: handleScheduleMedication calls triggerQuickAction meds', () => {
  assert.ok(APP.includes("sunnyBrain.triggerQuickAction('meds', { pillName, timeString });"));
});

test('handlers: defines handleMedicationTaken', () => {
  assert.ok(APP.includes('const handleMedicationTaken = useCallback(async (reminderId: string) => {'));
});

test('handlers: handleMedicationTaken calls markMedicationTaken', () => {
  assert.ok(APP.includes('await sunnyBrain.markMedicationTaken(reminderId);'));
});

test('handlers: defines handleDeleteMedication', () => {
  assert.ok(APP.includes('const handleDeleteMedication = useCallback(async (reminderId: string) => {'));
});

test('handlers: handleDeleteMedication calls deleteMedicationReminder', () => {
  assert.ok(APP.includes('await sunnyBrain.deleteMedicationReminder(reminderId);'));
});

// ============================================================================
// Digest handlers
// ============================================================================

test('handlers: defines handleFetchDailyDigest', () => {
  assert.ok(APP.includes('const handleFetchDailyDigest = useCallback(async () => {'));
});

test('handlers: handleFetchDailyDigest calls triggerQuickAction news', () => {
  assert.ok(APP.includes("sunnyBrain.triggerQuickAction('news');"));
});

test('handlers: defines handleSpeakDailyDigest', () => {
  assert.ok(APP.includes('const handleSpeakDailyDigest = useCallback(async () => {'));
});

test('handlers: handleSpeakDailyDigest calls speakDailyDigest', () => {
  assert.ok(APP.includes('await sunnyBrain.speakDailyDigest();'));
});

// ============================================================================
// Chat handlers
// ============================================================================

test('handlers: defines handleChatSubmit', () => {
  assert.ok(APP.includes('const handleChatSubmit = useCallback(async (e: React.FormEvent) => {'));
});

test('handlers: handleChatSubmit calls decide_action', () => {
  assert.ok(APP.includes('sunnyBrain.invokeTool("decide_action", { prompt: input });'));
});

test('handlers: handleChatSubmit calls execute_actions', () => {
  assert.ok(APP.includes('sunnyBrain.invokeTool("execute_actions", { actions });'));
});

// ============================================================================
// Window control handlers
// ============================================================================

test('handlers: defines handleToggleHighContrast', () => {
  assert.ok(APP.includes('const handleToggleHighContrast = useCallback(() => {'));
});

test('handlers: defines handleToggleAlwaysOnTop', () => {
  assert.ok(APP.includes('const handleToggleAlwaysOnTop = useCallback(() => {'));
});

test('handlers: defines handleToggleWindowFilled', () => {
  assert.ok(APP.includes('const handleToggleWindowFilled = useCallback(() => {'));
});

test('handlers: defines handleMinimizeWindow', () => {
  assert.ok(APP.includes('const handleMinimizeWindow = useCallback(() => {'));
});

test('handlers: defines handleCloseWindow', () => {
  assert.ok(APP.includes('const handleCloseWindow = useCallback(() => {'));
});

// ============================================================================
// Model and preferences handlers
// ============================================================================

test('handlers: defines handleInitModel', () => {
  assert.ok(APP.includes('const handleInitModel = useCallback(async () => {'));
});

test('handlers: handleInitModel calls initModel', () => {
  assert.ok(APP.includes('const status = await window.sunnyDesktop.initModel();'));
});

test('handlers: defines handlePreferencesUpdate', () => {
  assert.ok(APP.includes('const handlePreferencesUpdate = useCallback((patch: Partial<SunnyPreferences>) => {'));
});

test('handlers: defines handlePreferencesReset', () => {
  assert.ok(APP.includes('const handlePreferencesReset = useCallback(() => {'));
});

test('handlers: defines handleOnboardingComplete', () => {
  assert.ok(APP.includes('const handleOnboardingComplete = useCallback(() => {'));
});

test('handlers: defines handleOnboardingSkip', () => {
  assert.ok(APP.includes('const handleOnboardingSkip = useCallback(() => {'));
});

test('handlers: defines handleClearLogs', () => {
  assert.ok(APP.includes('const handleClearLogs = useCallback(async () => {'));
});

test('handlers: defines handleExportLogs', () => {
  assert.ok(APP.includes('const handleExportLogs = useCallback(async () => {'));
});

test('handlers: defines handleAutoCheckUpdatesChange', () => {
  assert.ok(APP.includes('const handleAutoCheckUpdatesChange = useCallback((enabled: boolean) => {'));
});

test('handlers: defines handleCheckForUpdates', () => {
  assert.ok(APP.includes('const handleCheckForUpdates = useCallback(async () => {'));
});

// ============================================================================
// Section state management
// ============================================================================

test('state: defines toggleSection', () => {
  assert.ok(APP.includes('const toggleSection = useCallback((id: SectionId) => {'));
});

test('state: toggleSection saves section state', () => {
  assert.ok(APP.includes('saveSectionState(next);'));
});

test('state: defines expandSection', () => {
  assert.ok(APP.includes('const expandSection = useCallback((id: SectionId) => {'));
});

test('state: expandSection saves section state', () => {
  assert.ok(APP.includes('saveSectionState(next);'));
});

// ============================================================================
// Rendered sections
// ============================================================================

test('render: renders system-health collapsible section', () => {
  assert.ok(APP.includes('id="system-health"'));
});

test('render: renders quick-actions collapsible section', () => {
  assert.ok(APP.includes('id="quick-actions"'));
});

test('render: renders recipes collapsible section', () => {
  assert.ok(APP.includes('id="recipes"'));
});

test('render: renders medication collapsible section', () => {
  assert.ok(APP.includes('id="medication"'));
});

test('render: renders digest collapsible section', () => {
  assert.ok(APP.includes('id="digest"'));
});

test('render: renders activity collapsible section', () => {
  assert.ok(APP.includes('id="activity"'));
});

test('render: renders ErrorBoundary wrapper', () => {
  assert.ok(APP.includes('<ErrorBoundary>'));
});

test('render: renders SettingsModal conditionally', () => {
  assert.ok(APP.includes('{showSettings && ('));
});

test('render: renders OnboardingScreen conditionally', () => {
  assert.ok(APP.includes('{showOnboarding && ('));
});

test('render: renders UpdateToast', () => {
  assert.ok(APP.includes('<UpdateToast'));
});

// ============================================================================
// Helper functions
// ============================================================================

test('helpers: defines StatusItem component', () => {
  assert.ok(APP.includes('function StatusItem('));
});

test('helpers: defines ActionButton component', () => {
  assert.ok(APP.includes('function ActionButton('));
});

test('helpers: defines ChatMessageItem component', () => {
  assert.ok(APP.includes('function ChatMessageItem('));
});

test('helpers: defines formatStatusForSpeech', () => {
  assert.ok(APP.includes('function formatStatusForSpeech(status: SystemStatus): string'));
});
