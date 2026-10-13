import type { SystemStatus } from '@/types/electron';

export interface ToolResult<T = unknown> {
  timestamp: string;
  success: boolean;
  toolName: string;
  result?: T;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

class SunnyBrain {
  private messageHistory: ChatMessage[] = [];
  private listeners: Set<(messages: ChatMessage[]) => void> = new Set();
  private statusListeners: Set<(status: SystemStatus) => void> = new Set();
  private statusInterval: number | null = null;

  async getSystemStatus(): Promise<SystemStatus> {
    if (!window.electronAPI) {
      throw new Error('Electron API is unavailable. Are you running inside Electron?');
    }
    return window.electronAPI.getSystemStatus();
  }

  startStatusPolling(intervalMs = 30000): void {
    if (this.statusInterval) return;
    
    const poll = async () => {
      try {
        const status = await this.getSystemStatus();
        this.statusListeners.forEach(fn => fn(status));
      } catch { // Ignore polling errors }
      }
    };
    
    poll();
    this.statusInterval = window.setInterval(poll, intervalMs);
  }

  stopStatusPolling(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  onSystemStatusChange(callback: (status: SystemStatus) => void): () => void {
    this.statusListeners.add(callback);
    if (window.electronAPI?.onSystemStatusChange) {
      const unsubscribe = window.electronAPI.onSystemStatusChange(callback);
      return () => {
        this.statusListeners.delete(callback);
        unsubscribe();
      };
    }
    return () => this.statusListeners.delete(callback);
  }

  async speakNotification(
    message: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    repeat: number = 1
  ): Promise<void> {
    const clampedRepeat = Math.min(Math.max(repeat, 1), 3);
    
    if (!window.electronAPI) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 0.9;
        utterance.volume = 1.0;
        utterance.pitch = 1.0;
        for (let i = 0; i < clampedRepeat; i++) {
          window.speechSynthesis.speak(utterance);
        }
        return;
      }
      throw new Error('Text-to-speech unavailable');
    }

    await window.electronAPI.speakNotification({
      message,
      priority,
      repeat: clampedRepeat,
    });
  }

  async invokeTool<T = unknown, P extends Record<string, unknown> = Record<string, unknown>>(
    toolName: string,
    params: P
  ): Promise<ToolResult<T>> {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available.');
    }

    try {
      const response = await window.electronAPI.invokeTool(toolName, params as Record<string, unknown>);
      return {
        timestamp: new Date().toISOString(),
        success: true,
        toolName,
        result: response as T,
      };
    } catch (err) { const error = err as Error;
      return {
        timestamp: new Date().toISOString(),
        success: false,
        toolName,
        error: error.message || 'Unknown error during tool execution',
      };
    }
  }

  addMessage(role: 'user' | 'assistant' | 'system', content: string): ChatMessage {
    const message: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
      role,
      content,
      timestamp: new Date(),
    };
    this.messageHistory.push(message);
    this.notifyListeners();
    return message;
  }

  getMessages(): ChatMessage[] {
    return [...this.messageHistory];
  }

  subscribe(listener: (messages: ChatMessage[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getMessages()));
  }

  clearMessages(): void {
    this.messageHistory = [];
    this.notifyListeners();
  }
}

export const sunnyBrain = new SunnyBrain();

