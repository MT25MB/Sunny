export interface BatteryInfo {
  batteryPercent: number | null;
  isCharging: boolean;
  health: 'good' | 'low' | 'error' | 'unknown';
}

export interface WifiInfo {
  connected: boolean;
  networkName: string | null;
  signalStrength: number | null;
}

export interface SystemInfo {
  cpuUsage: number;
  memoryAvailableGB: number;
  uptime: number;
  platform: string;
  nodeVersion: string;
}

export interface InternetInfo {
  reachable: boolean;
  testServer: string;
  latency: string;
}

export interface SystemStatus {
  timestamp: string;
  success: boolean;
  toolName: string;
  battery: BatteryInfo;
  wifi: WifiInfo;
  system: SystemInfo;
  internet: InternetInfo;
  recommendations: string[];
  userFriendlyMessage: string;
  error?: string;
  fallback?: {
    battery: BatteryInfo;
    wifi: WifiInfo;
    system: SystemInfo;
    internet: InternetInfo;
    recommendations: string[];
    userFriendlyMessage: string;
  };
}

export interface ElectronAPI {
  getSystemStatus(): Promise<SystemStatus>;
  speakNotification(params: { message: string; priority?: 'low' | 'normal' | 'high' | 'urgent'; repeat?: number }): Promise<void>;
  executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown>;
  onSystemStatusChange(callback: (status: SystemStatus) => void): () => void;
  onWindowVisibilityChange(callback: (payload: { visible: boolean }) => void): () => void;
}

export interface Window {
  electronAPI: ElectronAPI;
}

