import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Battery,
  Wifi,
  Cpu,
  HardDrive,
  Globe,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Volume2,
  RefreshCw,
  Trash2,
  MessageSquare,
  Shield,
  Utensils,
  Pill,
  Newspaper,
  Sun,
  Contrast,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Search,
  Plus,
} from 'lucide-react';
import { sunnyBrain, type ChatMessage } from '@/renderer/services/sunnyBrain';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SystemStatus, Recipe, MedicationReminder, DailyDigest, CookingStep } from '@/types/electron';

import mascot from '/assets/mascot.png';

const POLL_INTERVAL = 30000;

function App() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [cookingMode, setCookingMode] = useState<{ recipe: Recipe; currentStep: number } | null>(null);
  const [medicationReminders, setMedicationReminders] = useState<Array<{ id: string; pillName: string; timeString: string; enabled: boolean; lastTaken?: string; triggeredAt?: string }>>([]);
  const [dailyDigest, setDailyDigest] = useState<DailyDigest | null>(null);
  const [isFetchingDigest, setIsFetchingDigest] = useState(false);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Recipe[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [medicationRemindersLoaded, setMedicationRemindersLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const statusUnsubscribeRef = useRef<(() => void) | null>(null);
  const messagesUnsubscribeRef = useRef<(() => void) | null>(null);
  const medicationUnsubscribeRef = useRef<(() => void) | null>(null);
  const medicationAddedUnsubscribeRef = useRef<(() => void) | null>(null);
  const cookingStepUnsubscribeRef = useRef<(() => void) | null>(null);

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

    // Subscribe to medication reminders
    medicationUnsubscribeRef.current = sunnyBrain.onMedicationReminder((reminder) => {
      setMedicationReminders(prev => {
        const exists = prev.find(r => r.id === reminder.id);
        if (exists) {
          return prev.map(r => r.id === reminder.id ? { ...r, ...reminder, triggeredAt: reminder.triggeredAt } : r);
        }
        return [...prev, reminder];
      });
      // Show high-contrast alert
      sunnyBrain.addMessage('system', `🔔 Medication Reminder: Time to take ${reminder.pillName}!`);
      sunnyBrain.speakNotification(`Time to take your ${reminder.pillName}!`, 'high', 2);
    });

    medicationAddedUnsubscribeRef.current = sunnyBrain.onMedicationReminderAdded((reminder) => {
      setMedicationReminders(prev => {
        if (prev.find(r => r.id === reminder.id)) return prev;
        return [...prev, reminder];
      });
    });

    // Subscribe to cooking step changes
    cookingStepUnsubscribeRef.current = sunnyBrain.onCookingStepChange((step) => {
      setCookingMode(prev => prev ? { ...prev, currentStep: step.stepIndex } : null);
      if (window.electronAPI) {
        sunnyBrain.speakNotification(`Step ${step.stepIndex + 1} of ${step.totalSteps}: ${step.instruction}`, 'normal', 1);
      }
    });

    // Load medication reminders on startup
    const loadMedicationReminders = async () => {
      try {
        const reminders = await sunnyBrain.getMedicationReminders();
        setMedicationReminders(reminders);
        setMedicationRemindersLoaded(true);
      } catch (e) {
        console.error('Failed to load medication reminders:', e);
      }
    };
    loadMedicationReminders();

    sunnyBrain.getSystemStatus()
      .then(setSystemStatus)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
    
    sunnyBrain.startStatusPolling(POLL_INTERVAL);

    sunnyBrain.addMessage("system", "Welcome to Sunny. Your computer's health status appears above. Press the buttons below to check your system or hear it spoken aloud.");

    return () => {
      statusUnsubscribeRef.current?.();
      messagesUnsubscribeRef.current?.();
      medicationUnsubscribeRef.current?.();
      medicationAddedUnsubscribeRef.current?.();
      cookingStepUnsubscribeRef.current?.();
      sunnyBrain.stopStatusPolling();
    };
  }, [scrollToBottom]);


  const describeError = useCallback((err: unknown): string => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string' && err) return err;
    return 'Something went wrong and Sunny could not complete the request.';
  }, []);

  const handleCheckHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const status = await sunnyBrain.getSystemStatus();
      setSystemStatus(status);
      sunnyBrain.addMessage('assistant', formatStatusForSpeech(status));
    } catch (e) {
      const message = describeError(e);
      setError(message);
      sunnyBrain.addMessage('system', 'Error: ' + message);
    } finally {
      setIsLoading(false);
    }
  }, [describeError]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSpeakStatus = useCallback(async () => {
    if (!systemStatus) return;
    setIsSpeaking(true);
    try {
      const text = formatStatusForSpeech(systemStatus);
      await sunnyBrain.speakNotification(text, 'normal', 1);
      sunnyBrain.addMessage('assistant', 'SPOKEN: ' + text);
    } catch (e) {
      const message = describeError(e);
      setError(message);
      sunnyBrain.addMessage('system', 'Speech error: ' + message);
    } finally {
      setIsSpeaking(false);
    }
  }, [systemStatus, describeError]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleClearChat = useCallback(() => {
    sunnyBrain.clearMessages();
    sunnyBrain.addMessage("system", "Chat cleared. System health status is still shown above.");
  }, []);

  // Recipe search handler
  const handleSearchRecipe = useCallback(async () => {
    if (!recipeSearchQuery.trim()) return;
    setIsSearching(true);
    try {
      const result = await sunnyBrain.fetchVerifiedRecipe(recipeSearchQuery, 5);
      setSearchResults(result.recipes);
    } catch (e) {
      const message = describeError(e);
      setError(message);
    } finally {
      setIsSearching(false);
    }
  }, [recipeSearchQuery, describeError]);

  // Select recipe for cooking mode
  const handleSelectRecipe = useCallback((recipe: Recipe) => {
    setCookingMode({ recipe, currentStep: 0 });
    sunnyBrain.addMessage('assistant', `Starting cooking mode for ${recipe.title}. Step 1 of ${recipe.instructions.length}: ${recipe.instructions[0]}`);
    sunnyBrain.speakNotification(`Starting cooking mode for ${recipe.title}. Step 1: ${recipe.instructions[0]}`, 'normal', 1);
  }, []);

  // Cooking mode navigation
  const handleNextStep = useCallback(() => {
    if (!cookingMode) return;
    const nextStep = cookingMode.currentStep + 1;
    if (nextStep < cookingMode.recipe.instructions.length) {
      setCookingMode(prev => prev ? { ...prev, currentStep: nextStep } : null);
      const step = cookingMode.recipe.instructions[nextStep];
      sunnyBrain.addMessage('assistant', `Step ${nextStep + 1}: ${step}`);
      sunnyBrain.speakNotification(`Step ${nextStep + 1}: ${step}`, 'normal', 1);
      if (window.electronAPI) {
        window.electronAPI.invokeTool('emit_cooking_step', { stepIndex: nextStep, totalSteps: cookingMode.recipe.instructions.length, instruction: step });
      }
    }
  }, [cookingMode]);

  const handlePreviousStep = useCallback(() => {
    if (!cookingMode || cookingMode.currentStep === 0) return;
    const prevStep = cookingMode.currentStep - 1;
    setCookingMode(prev => prev ? { ...prev, currentStep: prevStep } : null);
    const step = cookingMode.recipe.instructions[prevStep];
    sunnyBrain.addMessage('assistant', `Step ${prevStep + 1}: ${step}`);
    sunnyBrain.speakNotification(`Step ${prevStep + 1}: ${step}`, 'normal', 1);
    if (window.electronAPI) {
      window.electronAPI.invokeTool('emit_cooking_step', { stepIndex: prevStep, totalSteps: cookingMode.recipe.instructions.length, instruction: cookingMode.recipe.instructions[prevStep] });
    }
  }, [cookingMode]);

  const handleExitCookingMode = useCallback(() => {
    setCookingMode(null);
    sunnyBrain.addMessage('system', 'Cooking mode exited.');
  }, []);

  // Medication reminder handlers
  const handleScheduleMedication = useCallback(async (pillName: string, timeString: string) => {
    try {
      await sunnyBrain.scheduleMedicationReminder(pillName, timeString);
      sunnyBrain.addMessage('assistant', `Medication reminder set for ${pillName} at ${timeString}.`);
      sunnyBrain.speakNotification(`Medication reminder set for ${pillName} at ${timeString}.`, 'normal', 1);
    } catch (e) {
      const message = describeError(e);
      setError(message);
    }
  }, [describeError]);

  const handleMedicationTaken = useCallback(async (reminderId: string) => {
    try {
      await sunnyBrain.markMedicationTaken(reminderId);
      setMedicationReminders(prev => prev.map(r => r.id === reminderId ? { ...r, enabled: false, lastTaken: new Date().toISOString() } : r));
      sunnyBrain.addMessage('system', 'Medication marked as taken.');
    } catch (e) {
      const message = describeError(e);
      setError(message);
    }
  }, [describeError]);

  const handleDeleteMedication = useCallback(async (reminderId: string) => {
    try {
      await sunnyBrain.deleteMedicationReminder(reminderId);
      setMedicationReminders(prev => prev.filter(r => r.id !== reminderId));
    } catch (e) {
      const message = describeError(e);
      setError(message);
    }
  }, [describeError]);

  // Daily digest handlers
  const handleFetchDailyDigest = useCallback(async () => {
    setIsFetchingDigest(true);
    try {
      const digest = await sunnyBrain.getDailyDigest();
      setDailyDigest(digest);
    } catch (e) {
      const message = describeError(e);
      setError(message);
    } finally {
      setIsFetchingDigest(false);
    }
  }, [describeError]);

  const handleSpeakDailyDigest = useCallback(async () => {
    if (!dailyDigest) return;
    try {
      await sunnyBrain.speakDailyDigest();
      sunnyBrain.addMessage('assistant', 'Morning digest spoken aloud.');
    } catch (e) {
      const message = describeError(e);
      setError(message);
    }
  }, [dailyDigest, describeError]);

  // High contrast toggle
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleToggleHighContrast = useCallback(() => {
    setHighContrast(prev => !prev);
    sunnyBrain.addMessage('system', `High contrast mode ${highContrast ? 'disabled' : 'enabled'}.`);
  }, [highContrast]);

  // Recipe search handler
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
    if (batteryLevel < 20) return { label: batteryLevel + "% — Low", level: "critical" as const };
    if (batteryLevel < 50) return { label: batteryLevel + "% — Medium", level: "warning" as const };
    return { label: batteryLevel + "%" + (isCharging ? " ⚡ Charging" : ""), level: "good" as const };
  }, [batteryLevel, isCharging]);

  const wifiStatus = useMemo(() => {
    if (!wifiConnected) return { label: "Disconnected", level: "critical" as const };
    return { label: "Connected: " + (wifiName ?? "Unknown"), level: "good" as const };
  }, [wifiConnected, wifiName]);

  const internetStatus = useMemo(() => ({
    label: internetReachable ? "Online" : "Offline",
    level: internetReachable ? "good" as const : "critical" as const,
  }), [internetReachable]);

  const cpuStatus = useMemo(() => {
    const pct = Math.round(cpuUsage);
    if (pct > 80) return { label: pct + "% — High", level: "critical" as const };
    if (pct > 50) return { label: pct + "% — Moderate", level: "warning" as const };
    return { label: pct + "% — Normal", level: "good" as const };
  }, [cpuUsage]);

  const memoryStatus = useMemo(() => {
    if (memoryGB < 2) return { label: memoryGB.toFixed(1) + " GB — Low", level: "critical" as const };
    if (memoryGB < 4) return { label: memoryGB.toFixed(1) + " GB — Moderate", level: "warning" as const };
    return { label: memoryGB.toFixed(1) + " GB — Healthy", level: "good" as const };
  }, [memoryGB]);

  return (
    <div className="app-shell">
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
            onClick={() => setHighContrast(!highContrast)}
            aria-label={highContrast ? "Disable high contrast mode" : "Enable high contrast mode"}
            aria-pressed={highContrast}
            title={highContrast ? "Disable high contrast" : "Enable high contrast"}
          >
            <Contrast size={24} />
          </button>
          <button 
            className="icon-btn" 
            onClick={() => setShowChat(!showChat)}
            aria-label={showChat ? "Hide chat history" : "Show chat history"}
            aria-pressed={showChat}
          >
            <MessageSquare size={24} />
          </button>
        </div>
      </header>

      <main className="app-main" role="main">
        <section className="health-card" aria-labelledby="health-title">
          <h2 id="health-title" className="section-title">
            <Shield size={20} /> System Health
          </h2>
          
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
            Last updated: {systemStatus ? new Date(systemStatus.timestamp).toLocaleTimeString() : "—"}
          </div>
        </section>

        {/* Recipe Search & Cooking Mode */}
        <section className="recipe-section" aria-labelledby="recipe-title">
          <div className="section-header">
            <h2 id="recipe-title" className="section-title">
              <Utensils size={20} /> Recipes & Cooking
            </h2>
          </div>
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
              <Search size={20} /> {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="recipe-results" role="list" aria-label="Recipe search results">
              {searchResults.map((recipe) => (
                <article key={recipe.id} className="recipe-card" role="listitem">
                  <div className="recipe-card-header">
                    <h3 className="recipe-title">{recipe.title}</h3>
                    <span className="recipe-meta">
                      <span>⏱️ {recipe.prepTimeMinutes + recipe.cookTimeMinutes} min</span>
                      <span>👥 {recipe.servings} servings</span>
                    </span>
                  </div>
                  <div className="recipe-preview">
                    <p className="recipe-ingredients">Ingredients: {recipe.ingredients.slice(0, 3).join(', ')}{recipe.ingredients.length > 3 ? '...' : ''}</p>
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
          </section>

          {/* Cooking Mode Overlay */}
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
                    aria-label={cookingMode.currentStep < cookingMode.recipe.instructions.length - 1 ? 'Next step' : 'Finish cooking'}
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
                      sunnyBrain.speakNotification(text, 'normal', 1);
                    }}
                    aria-label="Read current step aloud"
                  >
                    <Volume2 size={20} /> Read Step Aloud
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Medication Reminders */}
          <section className="medication-section" aria-labelledby="medication-title">
            <div className="section-header">
              <h2 id="medication-title" className="section-title">
                <Pill size={20} /> Medication Reminders
              </h2>
              <button className="add-medication-btn" onClick={() => {
                const pillName = prompt('Medication name:');
                if (!pillName) return;
                const timeString = prompt('Time (HH:MM, 24-hour):');
                if (timeString && /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString)) {
                  handleScheduleMedication(pillName.trim(), timeString);
                } else if (timeString) {
                  alert('Invalid time format. Use HH:MM (24-hour).');
                }
              }}>
                <Plus size={20} /> Add Reminder
              </button>
            </div>

            <div className="medication-list" role="list" aria-label="Medication reminders">
              {(medicationReminders.length === 0 ? (
                <p className="medication-empty">No medication reminders set. Add one above.</p>
              ) : (
                medicationReminders.map((reminder) => (
                  <article key={reminder.id} className={`medication-card ${reminder.enabled ? 'active' : 'taken'}`} role="listitem">
                    <div className="medication-info">
                      <h3 className="medication-name">{reminder.pillName}</h3>
                      <div className="medication-meta">
                        <span className="medication-time">
                          <Clock size={14} /> {reminder.timeString}
                        </span>
                        <span className={`medication-status ${reminder.enabled ? 'active' : 'taken'}`}>
                          {reminder.enabled ? '⏰ Active' : '✅ Taken'}
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
                        <span className="taken-badge">✅ Taken</span>
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
                )))
              )}
            </div>
          </section>

          {/* Daily Digest */}
          <section className="digest-section" aria-labelledby="digest-title">
            <div className="section-header">
              <h2 id="digest-title" className="section-title">
                <Newspaper size={20} /> Morning Digest
              </h2>
            </div>
            <div className="digest-content">
              {dailyDigest ? (
                <div className="digest-display">
                  <div className="digest-weather">
                    <h3><Sun size={18} /> Weather</h3>
                    <p className="weather-main">
                      <span className="temp">{dailyDigest.weather.temperature}°C</span>
                      <span className="condition">{dailyDigest.weather.condition}</span>
                    </p>
                    <p className="weather-location">{dailyDigest.weather.location}</p>
                  </div>
                  <div className="digest-news">
                    <h3><Newspaper size={18} /> Top News</h3>
                    {dailyDigest.news.length > 0 ? (
                      <ul className="news-list">
                        {dailyDigest.news.slice(0, 3).map((item, index) => (
                          <li key={index} className="news-item">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="news-title">
                              {item.title}
                            </a>
                            {item.summary && <p className="news-summary">{item.summary}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="no-news">No news available at this time.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="digest-empty">Press the button below to fetch your morning digest.</p>
              )}
            </div>
            <div className="digest-actions">
              <button
                className="digest-btn primary"
                onClick={handleFetchDailyDigest}
                disabled={isFetchingDigest}
              >
                <RefreshCw size={18} className={isFetchingDigest ? 'spin' : ''} />
                {isFetchingDigest ? 'Fetching...' : 'Fetch Morning Digest'}
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
          </section>

          {showChat && (
            <section className="chat-section" aria-labelledby="chat-title">
              <div className="chat-header">
                <h2 id="chat-title" className="section-title">
                  <MessageSquare size={20} /> Activity Log
                </h2>
              </div>
              <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation history">
                {messages.length === 0 ? (
                  <p className="chat-empty">No activity yet. Press a button above to start.</p>
                ) : (
                  messages.map((msg) => (
                    <ChatMessageItem key={msg.id} message={msg} />
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
            </section>
          )}

          <footer className="app-footer" role="contentinfo">
            <p>Sunny runs locally. Your data never leaves this computer.</p>
          </footer>
        </main>
      </div>
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ActionButton({ 
  icon, 
  label, 
  description, 
  onClick, 
  disabled, 
  loading,
  primary = false,
  variant = "primary",
}: ActionButtonProps) {
  return (
    <button
      className={"action-btn " + variant + " " + (primary ? "primary" : "") + " " + (loading ? "loading" : "")}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-disabled={disabled || loading}
    >
      <span className="btn-icon" aria-hidden="true">{icon}</span>
      <div className="btn-text">
        <span className="btn-label">{label}</span>
        <span className="btn-desc">{description}</span>
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
  if (battery !== null) {
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
