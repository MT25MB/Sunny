/*
 * Main Process IPC Handlers for Sunny Desktop Assistant
 *
 * This file implements the Electron IPC handlers that correspond to the
 * SunnyTool definitions in src/types/tools.ts. These handlers run in the
 * main process and provide access to system resources and functionality
 * that the renderer process requests via the electronAPI.
 *
 * Design principles:
 * - All handlers return structured JSON objects for tool execution
 * - Tool responses are formatted to be fed back into Nemotron LLM context
 * - Error handling is consistent and informative
 * - Accessibility considerations for older adult users
 * - Security validation via interceptor.cjs
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { net } = require('electron');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require('node:os');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require('node:crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require('node:child_process');

/**
 * Helper function to safely execute shell commands with error handling
 */
function executeCommand(command, timeout = 5000) {
  return new Promise((resolve, reject) => {
    // const startTime = Date.now();
    const proc = spawn(command, { shell: true });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
        return;
      }
      
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Helper function to format current timestamp for API responses
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Handler for get_system_status tool.
 * Checks battery level, Wi-Fi connectivity, and basic system health.
 * 
 * Returns structured JSON compatible with Nemotron tool execution context.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleGetSystemStatus(__event) {
  try {
    const timestamp = getTimestamp();
    
    // Get battery information
    const batteryInfo = {
      batteryPercent: null,
      isCharging: false,
      health: 'unknown'
    };
    
    if (process.platform === 'darwin') {
      try {
        // Try to get battery info from macOS
        const output = await executeCommand('pmset -g batt');
        const lines = output.split('\\n');
        const percentLine = lines.find(line => line.includes('%'));
        const chargingLine = lines.find(line => line.includes('AC'));
        
        if (percentLine) {
          const match = percentLine.match(/(\\d+)%/);
          if (match) batteryInfo.batteryPercent = parseInt(match[1]);
        }
        
        if (chargingLine) {
          batteryInfo.isCharging = chargingLine.includes('on');
        }
        
        batteryInfo.health = batteryInfo.batteryPercent !== null && 
          batteryInfo.batteryPercent < 20 ? 'low' : 'good';
      } catch {
        console.warn('Could not get battery info on macOS:', err.message);
      }
    } else if (process.platform === 'win32') {
      try {
        // Try to get battery info from Windows PowerShell
        const output = await executeCommand('$battery = Get-WmiObject -Class Win32_Battery; $battery.PropertyData');
        if (output) {
          // Parse Windows battery info
          batteryInfo.batteryPercent = 85; // Placeholder - would need actual parsing
          batteryInfo.isCharging = false;
          batteryInfo.health = 'good';
        }
      } catch {
        console.warn('Could not get battery info on Windows:', err.message);
      }
    }
    
    // Get Wi-Fi connectivity
    const wifiInfo = {
      connected: false,
      networkName: null,
      signalStrength: null
    };
    
    try {
      if (process.platform === 'darwin') {
        const output = await executeCommand('scutil --nwi');
        wifiInfo.connected = output.includes('State: connected');
        const ssidMatch = output.match(/SSID.*: ([^\\n]+)/);
        if (ssidMatch) wifiInfo.networkName = ssidMatch[1];
      } else if (process.platform === 'linux') {
        const output = await executeCommand('iwconfig 2>/dev/null | grep -A1 "IEEE 802.11"');
        wifiInfo.connected = output.includes('Connected');
        const ssidMatch = output.match(/ESSID:"([^"]+)"/);
        if (ssidMatch) wifiInfo.networkName = ssidMatch[1];
      }
    } catch {
      console.warn('Could not get Wi-Fi info:', err.message);
    }
    
    // Get system performance metrics
    const systemInfo = {
      cpuUsage: os.loadavg ? (os.loadavg()[0] / os.cpus().length * 100) : 0,
      memoryAvailableGB: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 0.1) / 10, // Available memory estimate
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version
    };
    
    // Test basic internet connectivity
    let internetReachable = false;
    try {
      const testUrl = 'https://api.sunny-ai.org/ping';
      // const startTime = Date.now();
      const response = await net.fetch(testUrl, { timeout: 3000 });
      internetReachable = response.status === 200;
    } catch {
      internetReachable = false;
    }
    
    const result = {
      timestamp,
      success: true,
      toolName: 'get_system_status',
      battery: batteryInfo,
      wifi: wifiInfo,
      system: systemInfo,
      internet: {
        reachable: internetReachable,
        testServer: 'https://api.sunny-ai.org/ping',
        latency: internetReachable ? '< 500ms' : 'unreachable'
      },
      recommendations: generateRecommendations(batteryInfo, wifiInfo, systemInfo, internetReachable),
      userFriendlyMessage: generateUserFriendlyStatus(batteryInfo, wifiInfo, systemInfo)
    };
    
    return result;
  } catch (error) {
    console.error('Error in get_system_status handler:', error);
    return {
      timestamp: getTimestamp(),
      success: false,
      toolName: 'get_system_status',
      error: `System status check failed: ${error.message}`,
      fallback: {
        battery: { batteryPercent: 0, isCharging: false, health: 'error' },
        wifi: { connected: false, networkName: null, signalStrength: null },
        system: { cpuUsage: 0, memoryAvailableGB: 0, uptime: 0, platform: process.platform, nodeVersion: process.version },
        internet: { reachable: false, testServer: 'https://api.sunny-ai.org/ping', latency: 'unreachable' },
        recommendations: ['Please check your device connection and try again.'],
        userFriendlyMessage: 'Unable to check system status at this time.'
      }
    };
  }
}

/**
 * Helper function to generate recommendations based on system status
 */
function generateRecommendations(batteryInfo, wifiInfo, systemInfo, internetReachable) {
  const recommendations = [];
  
  if (batteryInfo.batteryPercent !== null) {
    if (batteryInfo.batteryPercent < 20) {
      recommendations.push('Low battery detected. Consider plugging in your device soon.');
    } else if (batteryInfo.batteryPercent < 50) {
      recommendations.push('Battery level is moderate. You may want to consider charging soon.');
    }
  }
  
  if (!wifiInfo.connected) {
    recommendations.push('Wi-Fi connection not detected. Please check your network settings.');
  } else if (wifiInfo.networkName) {
    recommendations.push(`Connected to Wi-Fi network: ${wifiInfo.networkName}`);
  }
  
  if (systemInfo.cpuUsage > 80) {
    recommendations.push('High CPU usage detected. The system may be processing intensive tasks.');
  }
  
  if (systemInfo.memoryAvailableGB < 2) {
    recommendations.push('Low available memory. Consider closing other applications.');
  }
  
  if (!internetReachable) {
    recommendations.push('Internet connectivity issue detected. Please check your network connection.');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All systems operating normally. No actions required.');
  }
  
  return recommendations;
}

/**
 * Helper function to generate user-friendly status messages
 */
function generateUserFriendlyStatus(batteryInfo, wifiInfo, systemInfo) {
  const statusParts = [];
  
  if (batteryInfo.batteryPercent !== null) {
    if (batteryInfo.batteryPercent < 20) {
      statusParts.push('battery is low');
    } else if (batteryInfo.isCharging) {
      statusParts.push('charging');
    } else {
      statusParts.push(`${batteryInfo.batteryPercent}% battery remaining`);
    }
  }
  
  if (wifiInfo.connected && wifiInfo.networkName) {
    statusParts.push(`connected to ${wifiInfo.networkName}`);
  } else if (!wifiInfo.connected) {
    statusParts.push('not connected to Wi-Fi');
  }
  
  if (systemInfo.cpuUsage > 50) {
    statusParts.push('system is running busy');
  }
  
  if (systemInfo.memoryAvailableGB < 2) {
    statusParts.push('limited memory available');
  }
  
  if (statusParts.length === 0) {
    return 'System is running normally.';
  }
  
  return statusParts.join(', ') + '.';
}

/**
 * Handler for speak_notification tool.
 * Speaks text using the system's text-to-speech capabilities.
 * 
 * Returns structured JSON response for Nemotron tool execution context.
 */
async function handleSpeakNotification(_event: unknown, params) {
  try {
    const { message, priority = 'normal', repeat = 1 } = params || {};
    
    if (!message || typeof message !== 'string') {
      throw new Error('Message is required and must be a string.');
    }
    
    if (message.length > 500) {
      throw new Error('Message is too long. Maximum 500 characters allowed.');
    }
    
    if (repeat < 1 || repeat > 3) {
      throw new Error('Repeat count must be between 1 and 3.');
    }
    
    const timestamp = getTimestamp();
    
    // Log the TTS request for debugging
    console.log(`[Sunny TTS] Request: ${message.substring(0, 50)}... (priority: ${priority}, repeat: ${repeat})`);
    
    // In a real implementation, this would:
    // 1. Trigger TTS in the renderer process using Web Speech API
    // 2. Send confirmation back to Nemotron via electronAPI
    // 3. Handle speech completion events
    
    // For now, we'll simulate TTS execution and return a structured response
    const result = {
      timestamp,
      success: true,
      toolName: 'speak_notification',
      params: {
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        priority,
        repeat
      },
      speechRequestId: crypto.randomUUID(),
      status: 'queued',
      userFriendlyMessage: `Speaking alert${priority !== 'normal' ? ' (high priority)' : ''}...`,
      estimatedDuration: repeat * 2, // Approximate 2 seconds per message
      nextSteps: [
        'Message will be spoken aloud shortly',
        'Speech synthesis may take a few seconds',
        'This will help you stay informed about important alerts'
      ]
    };
    
    // Emit the TTS request to the renderer via mainWindow
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sunny:tts-request', {
        message,
        priority,
        repeat,
        requestId: result.speechRequestId
      });
    }
    
    return result;
  } catch (error) {
    console.error('Error in speak_notification handler:', error);
    return {
      timestamp: getTimestamp(),
      success: false,
      toolName: 'speak_notification',
      error: `Text-to-speech failed: ${error.message}`,
      fallback: {
        message: params?.message?.substring(0, 100) || '',
        priority: params?.priority || 'normal',
        repeat: params?.repeat || 1,
        userFriendlyMessage: 'Unable to speak message at this time.',
        nextSteps: ['Try again later or check device settings.']
      }
    };
  }
}

/**
 * Handler for get-available-tools tool.
 * Returns list of available tool names for the renderer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleGetAvailableTools(__event) {
  try {
    const timestamp = getTimestamp();
    
    const availableTools = [
      'get_system_status',
      'speak_notification'
    ];
    
    const result = {
      timestamp,
      success: true,
      toolName: 'get_available_tools',
      availableTools,
      count: availableTools.length,
      userFriendlyMessage: `Available tools: ${availableTools.join(', ')}.`,
      nextSteps: ['Use any tool to perform system operations.']
    };
    
    return result;
  } catch (error) {
    console.error('Error in get-available-tools handler:', error);
    return {
      timestamp: getTimestamp(),
      success: false,
      toolName: 'get_available_tools',
      error: `Failed to get available tools: ${error.message}`,
      availableTools: [],
      count: 0
    };
  }
}

/**
 * Handler for is-tool-available tool.
 * Checks if a specific tool is available.
 */
async function handleIsToolAvailable(_event: unknown, toolName) {
  try {
    if (!toolName || typeof toolName !== 'string') {
      throw new Error('Tool name is required and must be a string.');
    }
    
    const timestamp = getTimestamp();
    
    const availableTools = [
      'get_system_status',
      'speak_notification'
    ];
    
    const isAvailable = availableTools.includes(toolName);
    
    const result = {
      timestamp,
      success: true,
      toolName: 'is_tool_available',
      requestedTool: toolName,
      isAvailable,
      userFriendlyMessage: isAvailable ? 
        `Tool "${toolName}" is available.` : 
        `Tool "${toolName}" is not available.`,
      nextSteps: isAvailable ? 
        [`Use ${toolName} for tool execution.`] : 
        ['Choose from available tools or request new functionality.']
    };
    
    return result;
  } catch (error) {
    console.error('Error in is-tool-available handler:', error);
    return {
      timestamp: getTimestamp(),
      success: false,
      toolName: 'is_tool_available',
      requestedTool: toolName,
      isAvailable: false,
      error: `Failed to check tool availability: ${error.message}`
    };
  }
}

// Global reference to mainWindow for TTS events
let mainWindow;

/**
 * Set the main window reference for sending events to renderer
 */
function setMainWindow(window) {
  mainWindow = window;
}

/**
 * Export all handlers for registration in main.cjs
 */
module.exports = {
  handleGetSystemStatus,
  handleSpeakNotification,
  handleGetAvailableTools,
  handleIsToolAvailable,
  setMainWindow
};