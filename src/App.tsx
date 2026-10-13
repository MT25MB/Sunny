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
  VolumeX,
  RefreshCw,
  Trash2,
  MessageSquare,
  Shield,
  Home,
} from 'lucide-react';
import { sunnyBrain, type ChatMessage } from '@/renderer/services/sunnyBrain';
import type { SystemStatus } from '@/types/electron';

import mascot from '/assets/mascot.png';

const POLL_INTERVAL = 30000;

function App() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const statusUnsubscribeRef = useRef<(() => void) | null>(null);
  const messagesUnsubscribeRef = useRef<(() => void) | null>(null);

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

    sunnyBrain.getSystemStatus()
      .then(setSystemStatus)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
    
    sunnyBrain.startStatusPolling(POLL_INTERVAL);

    sunnyBrain.addMessage("system", "Welcome to Sunny. Your computer's health status appears above. Press the buttons below to check your system or hear it spoken aloud.");

    return () => {
      statusUnsubscribeRef.current?.();
      messagesUnsubscribeRef.current?.();
      sunnyBrain.stopStatusPolling();
    };
  }, [scrollToBottom]);


  const handleCheckHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const status = await sunnyBrain.getSystemStatus();
      setSystemStatus(status);
      sunnyBrain.addMessage("assistant", formatStatusForSpeech(status));
    } catch (e) { const err = e as Error;
      setError(err.message);
      sunnyBrain.addMessage("system", "Error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSpeakStatus = useCallback(async () => {
    if (!systemStatus) return;
    setIsSpeaking(true);
    try {
      const text = formatStatusForSpeech(systemStatus);
      await sunnyBrain.speakNotification(text, "normal", 1);
      sunnyBrain.addMessage("assistant", "SPOKEN: " + text);
    } catch (e) { const err = e as Error;
      setError(err.message);
      sunnyBrain.addMessage("system", "Speech error: " + err.message);
    } finally {
      setIsSpeaking(false);
    }
  }, [systemStatus]);

  const handleClearChat = useCallback(() => {
    sunnyBrain.clearMessages();
    sunnyBrain.addMessage("system", "Chat cleared. System health status is still shown above.");
  }, []);

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

        <section className="actions-section" aria-labelledby="actions-title">
          <h2 id="actions-title" className="section-title">Quick Actions</h2>
          <div className="action-grid">
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
              icon={<Home size={28} />}
              label="Open Settings"
              description="Adjust voice, speed, and AI model"
              onClick={() => sunnyBrain.addMessage("system", "Settings would open here.")}
              variant="secondary"
            />
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
