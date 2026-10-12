export type CredentialKey =
  | 'openai_api_key'
  | 'anthropic_api_key'
  | 'groq_api_key';

export type CredentialStore = {
  getCredential(key: CredentialKey): Promise<string>;
  setCredential(key: CredentialKey, value: string): Promise<void>;
  deleteCredential(key: CredentialKey): Promise<void>;
  hasCredential(key: CredentialKey): Promise<boolean>;
};

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.sunnyDesktop;
}

function getElectronStore(): CredentialStore | null {
  if (!isElectron() || !window.sunnyDesktop) return null;
  const desktop = window.sunnyDesktop;
  if (!desktop.saveCredential || !desktop.loadCredential || !desktop.deleteCredential) return null;
  return {
    async getCredential(key: CredentialKey): Promise<string> {
      const result = await desktop.loadCredential!(key);
      return result.value ?? '';
    },
    async setCredential(key: CredentialKey, value: string): Promise<void> {
      await desktop.saveCredential!(key, value);
    },
    async deleteCredential(key: CredentialKey): Promise<void> {
      await desktop.deleteCredential!(key);
    },
    async hasCredential(key: CredentialKey): Promise<boolean> {
      const result = await desktop.loadCredential!(key);
      return !!result.value;
    },
  };
}

const memoryStore = new Map<string, string>();

function getMemoryStore(): CredentialStore {
  return {
    async getCredential(key: CredentialKey): Promise<string> {
      return memoryStore.get(key) ?? '';
    },
    async setCredential(key: CredentialKey, value: string): Promise<void> {
      memoryStore.set(key, value);
    },
    async deleteCredential(key: CredentialKey): Promise<void> {
      memoryStore.delete(key);
    },
    async hasCredential(key: CredentialKey): Promise<boolean> {
      return memoryStore.has(key);
    },
  };
}

function getStore(): CredentialStore {
  return getElectronStore() ?? getMemoryStore();
}

export async function getCredential(key: CredentialKey): Promise<string> {
  return getStore().getCredential(key);
}

export async function setCredential(key: CredentialKey, value: string): Promise<void> {
  if (!value.trim()) {
    await getStore().deleteCredential(key);
    return;
  }
  await getStore().setCredential(key, value);
}

export async function deleteCredential(key: CredentialKey): Promise<void> {
  await getStore().deleteCredential(key);
}

export async function hasCredential(key: CredentialKey): Promise<boolean> {
  return getStore().hasCredential(key);
}

export async function testProviderConnection(
  provider: 'openai' | 'anthropic' | 'groq' | 'ollama',
  options: { apiKey?: string; endpoint?: string; model?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    switch (provider) {
      case 'openai': {
        if (!options.apiKey?.trim()) return { success: false, message: 'Enter an API key first.' };
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${options.apiKey}` },
        });
        if (res.ok) return { success: true, message: 'Connected. Your OpenAI key is valid.' };
        if (res.status === 401) return { success: false, message: 'Your API key was rejected by OpenAI.' };
        return { success: false, message: `OpenAI returned status ${res.status}.` };
      }
      case 'anthropic': {
        if (!options.apiKey?.trim()) return { success: false, message: 'Enter an API key first.' };
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });
        if (res.ok || res.status === 400) return { success: true, message: 'Connected. Your Anthropic key is valid.' };
        if (res.status === 401) return { success: false, message: 'Your API key was rejected by Anthropic.' };
        return { success: false, message: `Anthropic returned status ${res.status}.` };
      }
      case 'groq': {
        if (!options.apiKey?.trim()) return { success: false, message: 'Enter an API key first.' };
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${options.apiKey}` },
        });
        if (res.ok) return { success: true, message: 'Connected. Your Groq key is valid.' };
        if (res.status === 401) return { success: false, message: 'Your API key was rejected by Groq.' };
        return { success: false, message: `Groq returned status ${res.status}.` };
      }
      case 'ollama': {
        const endpoint = options.endpoint?.trim() || 'http://localhost:11434';
        try {
          const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return { success: false, message: `Ollama responded with status ${res.status}.` };
          const data = await res.json() as { models?: { name: string }[] };
          const models = data.models ?? [];
          if (options.model && !models.some((m) => m.name.startsWith(options.model!))) {
            return {
              success: false,
              message: `Ollama is running but the model "${options.model}" is not pulled yet. Run: ollama pull ${options.model}`,
            };
          }
          return { success: true, message: `Ollama is running with ${models.length} model${models.length === 1 ? '' : 's'} available.` };
        } catch {
          return {
            success: false,
            message: 'Ollama is not running. Start Ollama and try again.',
          };
        }
      }
      default:
        return { success: false, message: 'Unknown provider.' };
    }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Connection failed.' };
  }
}
