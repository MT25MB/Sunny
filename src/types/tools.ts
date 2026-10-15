









































/**
 * Type definitions for Sunny's tool calling system.
 * 
 * This module defines a strict JSON Schema-compatible format for tool definitions
 * used by the Sunny desktop assistant (Electron app for older adults).
 * 
 * Design goals:
 * - Strict adherence to JSON Schema Draft 2020-12 for parameter validation
 * - Self-documenting interfaces with comprehensive inline comments
 * - Type-safe tool registry for LLM function calling integration
 * - Accessibility-first: tool descriptions written in plain language
 */

// ============================================================================
// JSON Schema Type Definitions
// ============================================================================

/**
 * Supported JSON Schema primitive types for tool parameters.
 * Restricted to types that can be reliably serialized and validated.
 * 
 * @see https://json-schema.org/draft/2020-12/json-schema-core.html#section-6.1.1
 */
export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

/**
 * Base interface for a JSON Schema property definition.
 * Extends the minimal JSON Schema property vocabulary.
 */
export interface JsonSchemaProperty {
  /** The JSON Schema type keyword - must be one of the supported primitive types */
  type: JsonSchemaType;
  /** Human-readable description of what this parameter represents */
  description: string;
  /** Optional: default value if parameter is omitted */
  default?: unknown;
  /** Optional: enum constraint for string values (e.g., predefined options) */
  enum?: readonly string[];
  /** Optional: minimum value for numeric types */
  minimum?: number;
  /** Optional: maximum value for numeric types */
  maximum?: number;
  /** Optional: minimum length for strings/arrays */
  minLength?: number;
  /** Optional: maximum length for strings/arrays */
  maxLength?: number;
  /** Optional: pattern constraint for string validation (regex) */
  pattern?: string;
  /** Optional: items schema for array types */
  items?: JsonSchemaProperty;
  /** Optional: nested properties for object types */
  properties?: Record<string, JsonSchemaProperty>;
  /** Optional: required property names for object types */
  required?: readonly string[];
  /** Optional: whether additional properties are allowed (for objects) */
  additionalProperties?: boolean;
}

/**
 * Complete JSON Schema object for a tool's parameter schema.
 * Always an object type at the root level per function calling conventions.
 */
export interface ToolParameterSchema {
  /** Must be 'object' for function calling parameter schemas */
  type: 'object';
  /** Map of parameter name to its JSON Schema definition */
  properties: Record<string, JsonSchemaProperty>;
  /** Array of required parameter names */
  required: readonly string[];
  /** Disallow additional properties not defined in the schema (strict mode) */
  additionalProperties: false;
}

// ============================================================================
// Sunny Tool Interfaces
// ============================================================================

/**
 * Represents a single tool available to the Sunny assistant.
 * 
 * Each tool corresponds to a discrete action the assistant can perform
 * on behalf of the user (e.g., checking battery, speaking text).
 * 
 * The schema follows OpenAI/Anthropic function calling conventions
 * with strict JSON Schema validation.
 */
export interface SunnyTool {
  /** Unique identifier for the tool (snake_case, used in function calls) */
  name: string;
  /** 
   * Plain-language description of what the tool does.
   * Written for older adults - clear, non-technical language.
   * Used by the LLM to decide when to invoke this tool.
   */
  description: string;
  /** 
   * JSON Schema definition of the tool's input parameters.
   * Must be a valid ToolParameterSchema (object type with properties).
   */
  parameters: ToolParameterSchema;
}

/**
 * Type guard to verify a value conforms to ToolParameterSchema.
 * Useful for runtime validation of dynamically loaded tools.
 */
export function isToolParameterSchema(value: unknown): value is ToolParameterSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as Record<string, unknown>).type === 'object' &&
    'properties' in value &&
    'required' in value &&
    Array.isArray((value as ToolParameterSchema).required)
  );
}

// ============================================================================
// Built-in Tool Definitions (SUNNY_TOOLS)
// ============================================================================

/**
 * Core system tools available to Sunny by default.
 * 
 * These tools are designed for older adults' daily needs:
 * - System health monitoring (battery, connectivity)
 * - Accessible notifications via text-to-speech
 * 
 * Each tool includes:
 * - Clear, jargon-free descriptions
 * - Strict parameter schemas with validation constraints
 * - Sensible defaults where applicable
 * 
 * @example
 * // Tool invocation via LLM function calling:
 * // { "name": "speak_notification", "arguments": { "message": "Your medication reminder" } }
 */
export const SUNNY_TOOLS: readonly SunnyTool[] = [
  {
    name: 'get_system_status',
    description:
      'Checks the computer\'s battery level, Wi-Fi connection status, and overall system health. ' +
      'Use this when the user asks "how is my computer doing?" or "am I connected to the internet?".',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'speak_notification',
    description:
      'Reads a message aloud using the computer\'s text-to-speech voice. ' +
      'Use this for important alerts, reminders, or any message the user should hear clearly. ' +
      'The voice is configured to speak slowly and clearly for older adults.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description:
            'The exact text to read aloud. Should be complete sentences, ' +
            'free of technical jargon, and phrased kindly for an older adult.',
          minLength: 1,
          maxLength: 500,
        },
        priority: {
          type: 'string',
          description:
            'Urgency level of the notification. Affects voice tone and interruption behavior.',
          enum: ['low', 'normal', 'high', 'urgent'] as const,
          default: 'normal',
        },
        repeat: {
          type: 'integer',
          description:
            'Number of times to repeat the message (1-3). Useful for urgent reminders.',
          minimum: 1,
          maximum: 3,
          default: 1,
        },
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
] as const;

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extracts the parameter type from a SunnyTool definition.
 * Useful for creating type-safe tool handlers.
 * 
 * @example
 * type SpeakNotificationParams = ToolParameters<typeof SUNNY_TOOLS[1]>;
 * // { message: string; priority?: 'low' | 'normal' | 'high' | 'urgent'; repeat?: number; }
 */
export type ToolParameters<T extends SunnyTool> = T['parameters']['properties'] extends Record<
  string,
  JsonSchemaProperty
>
  ? {
      [K in keyof T['parameters']['properties']]: T['parameters']['properties'][K] extends {
        type: 'string';
        enum: readonly (infer E)[];
      }
        ? E
        : T['parameters']['properties'][K] extends { type: 'number' }
        ? number
        : T['parameters']['properties'][K] extends { type: 'integer' }
        ? number
        : T['parameters']['properties'][K] extends { type: 'boolean' }
        ? boolean
        : T['parameters']['properties'][K] extends { type: 'object' }
        ? Record<string, unknown>
        : T['parameters']['properties'][K] extends { type: 'array' }
        ? unknown[]
        : unknown;
    } & {
      // Required fields are enforced
      [K in T['parameters']['required'][number]]: unknown;
    }
  : never;

/**
 * Union type of all available tool names for type-safe dispatching.
 * Automatically stays in sync with SUNNY_TOOLS array.
 */
export type SunnyToolName = (typeof SUNNY_TOOLS)[number]['name'];

/**
 * Map of tool name to its parameter type for handler implementations.
 * Enables type-safe tool routing.
 */
export interface SunnyToolHandlers {
  get_system_status: () => Promise<SystemStatusResult>;
  speak_notification: (params: ToolParameters<typeof SUNNY_TOOLS[1]>) => Promise<void>;
}

/**
 * Expected result shape for get_system_status tool.
 * Returned to the LLM for user-facing response generation.
 */
export interface SystemStatusResult {
  /** Battery percentage (0-100), or null if not available (desktop) */
  batteryPercent: number | null;
  /** Whether the device is currently charging */
  isCharging: boolean;
  /** Wi-Fi connection status */
  wifiConnected: boolean;
  /** Wi-Fi network name (SSID) if connected */
  wifiNetwork: string | null;
  /** Internet connectivity verified via ping */
  internetReachable: boolean;
  /** CPU usage percentage (0-100) */
  cpuUsage: number;
  /** Available memory in GB */
  memoryAvailableGB: number;
  /** ISO timestamp of the check */
  checkedAt: string;
}

/**
 * Registry for dynamically registering additional tools at runtime.
 * Maintains type safety while allowing plugin-style extensions.
 */
export class SunnyToolRegistry {
  private tools: Map<string, SunnyTool> = new Map();

  constructor(initialTools: readonly SunnyTool[] = SUNNY_TOOLS) {
    for (const tool of initialTools) {
      this.register(tool);
    }
  }

  /** Register a new tool, validating its schema */
  register(tool: SunnyTool): void {
    if (!isToolParameterSchema(tool.parameters)) {
      throw new Error(`Invalid parameter schema for tool: ${tool.name}`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name */
  get(name: string): SunnyTool | undefined {
    return this.tools.get(name);
  }

  /** Get all registered tools as an array */
  getAll(): readonly SunnyTool[] {
    return Array.from(this.tools.values());
  }

  /** Get tool names for LLM function declarations */
  getNames(): readonly string[] {
    return Array.from(this.tools.keys());
  }

  /** Check if a tool exists */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

/**
 * Default singleton registry instance for application-wide use.
 * Pre-populated with SUNNY_TOOLS.
 */
export const sunnyToolRegistry = new SunnyToolRegistry();
