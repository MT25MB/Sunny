import type { BrainProvider } from './agent-brain';
import type { DesktopAction } from './desktop-actions';
import { formatActionForDisplay, validateActionBatch } from './desktop-actions';
import { detectInjection, SYSTEM_INSTRUCTIONS } from './agent-protocol';
import { interceptAction, checkParameterAmbiguity, sanitizeUntrustedContent, type InterceptorResult } from '@/main/security/interceptor';

export type LoopCallback = (event: LoopEvent) => void;

export type LoopEvent =
  | { type: 'state'; state: string }
  | { type: 'screenshot'; dataUrl: string }
  | { type: 'observe'; description: string; injectionDetected: boolean; injectionPatterns: string[] }
  | { type: 'plan'; actions: DesktopAction[]; reasoning: string }
  | { type: 'execute'; action: DesktopAction; index: number; total: number }
  | { type: 'action-complete'; action: DesktopAction; index: number; success: boolean }
  | { type: 'injection-warning'; patterns: string[]; severity: string }
  | { type: 'action-blocked'; action: DesktopAction; reason: string }
  | { type: 'action-needs-confirm'; action: DesktopAction; confirmLabel: string; confirmReason: string }
  | { type: 'clarification-needed'; question: string }
  | { type: 'stuck'; reason: string }
  | { type: 'complete'; summary: string; actionCount: number }
  | { type: 'error'; message: string }
  | { type: 'stopped'; partialActions: number };

export type LoopOptions = {
  brain: BrainProvider;
  request: string;
  preferences: {
    execution_speed: 'careful' | 'balanced' | 'fast';
    require_sensitive_confirmation: boolean;
    local_only: boolean;
  };
  onEvent: LoopCallback;
  cancellationToken: { cancelled: boolean };
  approvedActions?: DesktopAction[];
};

const SPEED_DELAYS: Record<string, number> = {
  careful: 1500,
  balanced: 950,
  fast: 550,
};

const MAX_REPEAT_FAILURES = 3;

type DesktopBridge = {
  captureScreen: () => Promise<{ dataUrl: string; width: number; height: number }>;
  executeActions: (actions: unknown[]) => Promise<{ completed: number; cancelled: boolean }>;
  writeDebugLog: (entry: unknown) => Promise<{ success: boolean }>;
  sanitizeContent: (text: string) => Promise<string>;
};

function getDesktopBridge(): DesktopBridge | null {
  if (typeof window !== 'undefined' && window.sunnyDesktop) {
    return {
      captureScreen: window.sunnyDesktop.captureScreen,
      executeActions: window.sunnyDesktop.executeActions,
      writeDebugLog: window.sunnyDesktop.writeDebugLog ?? (async () => {}),
      sanitizeContent: window.sunnyDesktop.sanitizeContent ?? (async (text: string) => text),
    };
  }
  return null;
}

export async function runAgentLoop(options: LoopOptions): Promise<void> {
  const { brain, request, preferences, onEvent, cancellationToken } = options;
  const bridge = getDesktopBridge();

  if (!bridge) {
    onEvent({ type: 'error', message: 'Desktop bridge is not available. The app may not be running in Electron mode.' });
    return;
  }

  const delay = SPEED_DELAYS[preferences.execution_speed] ?? 950;
  const allActionsTaken: DesktopAction[] = [];
  let consecutiveFailures = 0;
  let lastActionSignature = '';

  onEvent({ type: 'state', state: 'EXECUTE' });

  for (let iteration = 0; iteration < SYSTEM_INSTRUCTIONS.actionLimits.maxLoopIterations; iteration++) {
    if (cancellationToken.cancelled) {
      onEvent({ type: 'stopped', partialActions: allActionsTaken.length });
      return;
    }

    onEvent({ type: 'state', state: 'OBSERVE' });

    let screenDataUrl = '';
    try {
      const screen = await bridge.captureScreen();
      screenDataUrl = screen.dataUrl;
      onEvent({ type: 'screenshot', dataUrl: screenDataUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not capture the screen.';
      onEvent({ type: 'error', message });
      return;
    }

    let screenDescription = '';
    try {
      const analysis = await brain.analyzeScreen(
        'Describe what you see on the screen in one or two sentences. Focus on windows, buttons, text fields, and navigation elements.',
        screenDataUrl
      );
      screenDescription = analysis.response;
    } catch {
      screenDescription = 'Unable to analyze the screen.';
    }

    // Sanitize screen text for indirect prompt injection before feeding to brain
    try {
      screenDescription = await bridge.sanitizeContent(screenDescription);
    } catch {
      // Fallback to local sanitization if bridge unavailable
      screenDescription = sanitizeUntrustedContent(screenDescription);
    }

    // Also run the pattern-based injection detector
    const injectionResult = detectInjection(screenDescription);
    if (injectionResult.flagged) {
      onEvent({
        type: 'injection-warning',
        patterns: injectionResult.patterns,
        severity: injectionResult.severity,
      });
      onEvent({
        type: 'observe',
        description: injectionResult.sanitized,
        injectionDetected: true,
        injectionPatterns: injectionResult.patterns,
      });

      if (injectionResult.severity === 'high') {
        onEvent({
          type: 'error',
          message: 'Sunny detected a potential prompt injection attack in the screen content. Stopping for your safety.',
        });
        await writeDebugEntry(bridge, request, allActionsTaken, 'injection-detected', injectionResult.patterns);
        return;
      }
    } else {
      onEvent({ type: 'observe', description: screenDescription, injectionDetected: false, injectionPatterns: [] });
    }

    if (cancellationToken.cancelled) {
      onEvent({ type: 'stopped', partialActions: allActionsTaken.length });
      return;
    }

    onEvent({ type: 'state', state: 'EXECUTE' });

    let plan;
    try {
      plan = await brain.decideNextAction({
        request,
        screenDescription: injectionResult.sanitized,
        previousActions: allActionsTaken,
        iteration,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The brain provider returned an error.';
      onEvent({ type: 'error', message });
      return;
    }

    onEvent({ type: 'plan', actions: plan.actions, reasoning: plan.reasoning });

    // Check if the brain is requesting clarification
    if (plan.needsClarification && plan.clarificationQuestion) {
      onEvent({ type: 'clarification-needed', question: plan.clarificationQuestion });
      await writeDebugEntry(bridge, request, allActionsTaken, 'clarification-needed', []);
      return;
    }

    if (plan.isComplete || plan.actions.length === 0) {
      const summary = buildSummary(request, allActionsTaken);
      onEvent({ type: 'complete', summary, actionCount: allActionsTaken.length });
      await writeDebugEntry(bridge, request, allActionsTaken, 'completed', []);
      return;
    }

    const validation = validateActionBatch(plan.actions);
    if (!validation.valid) {
      onEvent({ type: 'error', message: validation.error ?? 'Invalid action in plan.' });
      return;
    }

    // Check for ambiguous parameters before executing
    const ambiguity = checkParameterAmbiguity(plan.actions);
    if (ambiguity.isAmbiguous) {
      onEvent({ type: 'clarification-needed', question: ambiguity.question });
      await writeDebugEntry(bridge, request, allActionsTaken, 'clarification-needed', []);
      return;
    }

    for (let i = 0; i < plan.actions.length; i++) {
      if (cancellationToken.cancelled) {
        onEvent({ type: 'stopped', partialActions: allActionsTaken.length });
        return;
      }

      const action = plan.actions[i];

      // Interceptor: validate every action before execution
      const interceptorResult: InterceptorResult = interceptAction(action);
      if (interceptorResult.verdict === 'block') {
        onEvent({ type: 'action-blocked', action, reason: interceptorResult.reason });
        onEvent({ type: 'error', message: `Sunny blocked an unsafe action: ${interceptorResult.reason}` });
        await writeDebugEntry(bridge, request, allActionsTaken, 'blocked', []);
        return;
      }
      if (interceptorResult.verdict === 'confirm') {
        onEvent({
          type: 'action-needs-confirm',
          action,
          confirmLabel: interceptorResult.confirmLabel ?? 'Confirm action',
          confirmReason: interceptorResult.confirmReason ?? 'This action needs your approval.',
        });
        cancellationToken.cancelled = true;
        return;
      }

      onEvent({ type: 'execute', action, index: allActionsTaken.length, total: allActionsTaken.length + plan.actions.length });

      try {
        const result = await bridge.executeActions([action]);
        const success = !result.cancelled && result.completed > 0;
        onEvent({ type: 'action-complete', action, index: allActionsTaken.length, success });

        allActionsTaken.push(action);

        const signature = `${action.type}:${JSON.stringify(action)}`;
        if (signature === lastActionSignature) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
          lastActionSignature = signature;
        }

        if (consecutiveFailures >= MAX_REPEAT_FAILURES) {
          onEvent({
            type: 'stuck',
            reason: 'Sunny seems to be repeating the same action without progress. Please check the screen and try again.',
          });
          await writeDebugEntry(bridge, request, allActionsTaken, 'stuck', []);
          return;
        }

        await sleep(delay);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An action failed.';
        onEvent({ type: 'action-complete', action, index: allActionsTaken.length, success: false });
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_REPEAT_FAILURES) {
          onEvent({ type: 'stuck', reason: `Repeated failures: ${message}` });
          await writeDebugEntry(bridge, request, allActionsTaken, 'failed', []);
          return;
        }
      }
    }
  }

  onEvent({
    type: 'error',
    message: 'Sunny reached the maximum number of steps for this task. Try breaking your request into smaller steps.',
  });
  await writeDebugEntry(bridge, request, allActionsTaken, 'failed', []);
}

function buildSummary(request: string, actions: DesktopAction[]): string {
  if (actions.length === 0) return 'No actions were needed.';
  const descriptions = actions.slice(0, 3).map(formatActionForDisplay);
  const suffix = actions.length > 3 ? ` and ${actions.length - 3} more` : '';
  return `${descriptions.join(', ')}${suffix}`;
}

async function writeDebugEntry(
  bridge: DesktopBridge,
  request: string,
  actions: DesktopAction[],
  outcome: string,
  injectionPatterns: string[]
): Promise<void> {
  try {
    await bridge.writeDebugLog({
      timestamp: new Date().toISOString(),
      request,
      actions: actions.map((a) => ({ type: a.type, ...stripType(a) })),
      actionCount: actions.length,
      outcome,
      injectionPatterns,
    });
  } catch {
    // Debug logging is best-effort
  }
}

function stripType(action: DesktopAction): Record<string, unknown> {
  const rest = { ...action } as Record<string, unknown>;
  delete rest.type;
  return rest;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
