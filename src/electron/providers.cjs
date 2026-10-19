/**
 * Cloud / local provider inference.
 *
 * Settings has always offered OpenAI, Anthropic, Groq and Ollama, stored their
 * API keys, and could test the connection — but nothing here existed, so
 * selecting a provider silently did nothing: every request went to the local
 * Moondream model regardless. This module is the missing backend.
 *
 * Two deliberate constraints:
 *  - It runs in the MAIN process. API keys are held by the credential store
 *    (safeStorage) and are never handed to the renderer.
 *  - Every request carries the same system guardrail used locally, so a cloud
 *    provider is not a way around the injection policy.
 *
 * No SDKs: each provider is a single documented HTTP call, so plain fetch
 * keeps the packaged app free of four more dependencies.
 */

'use strict';

const DEFAULT_TIMEOUT_MS = 60_000;

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ProviderError';
    this.status = status || 0;
  }
}

/** Rejects a URL that is not plain http(s), so an endpoint cannot smuggle file://. */
function assertHttpUrl(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ProviderError(`${label} is not a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ProviderError(`${label} must be an http or https address.`);
  }
  return parsed;
}

async function postJson(url, { headers, body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  assertHttpUrl(url, 'Endpoint');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const detail =
        (parsed && (parsed.error?.message || parsed.message)) ||
        text.slice(0, 200) ||
        response.statusText;
      throw new ProviderError(`Request failed (${response.status}): ${detail}`, response.status);
    }
    return parsed;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err && err.name === 'AbortError') {
      throw new ProviderError('The request timed out. Check your connection and try again.');
    }
    throw new ProviderError(err?.message ? `Network error: ${err.message}` : 'Network error.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds the user turn for the OpenAI-compatible shape.
 * `imageBase64` is a raw base64 PNG/JPEG with no data-URL prefix.
 */
async function runOpenAiCompatible({ prompt, imageBase64, apiKey, model, baseUrl }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const content = imageBase64
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
      ]
    : prompt;

  const payload = await postJson(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model,
      max_tokens: 512,
      temperature: 0.3,
      messages: [{ role: 'user', content }],
    },
  });
  return payload?.choices?.[0]?.message?.content ?? '';
}

async function runOllama({ prompt, imageBase64, endpoint, model }) {
  const base = assertHttpUrl(endpoint, 'Ollama endpoint');
  const images = imageBase64 ? [imageBase64] : undefined;

  const chatUrl = `${base.origin}${base.pathname.replace(/\/+$/, '')}`.replace(/\/$/, '') + '/api/chat';
  const payload = await postJson(chatUrl, {
    headers: { 'Content-Type': 'application/json' },
    body: {
      model,
      stream: false,
      messages: [{ role: 'user', content: prompt, ...(images ? { images } : {}) }],
    },
  });
  return payload?.message?.content ?? '';
}

async function runAnthropic({ prompt, imageBase64, apiKey, model }) {
  const content = imageBase64
    ? [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
        },
        { type: 'text', text: prompt },
      ]
    : prompt;

  const payload = await postJson('https://api.anthropic.com/v1/messages', {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model,
      max_tokens: 512,
      temperature: 0.3,
      messages: [{ role: 'user', content }],
    },
  });
  return (payload?.content || []).map((part) => part?.text || '').join('');
}

/** Endpoint defaults per provider. Ollama's are user-configurable. */
const PROVIDER_DEFAULTS = {
  openai: { baseUrl: 'https://api.openai.com/v1' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1' },
  ollama: { baseUrl: 'http://localhost:11434' },
};

/**
 * Runs one inference against the selected provider.
 *
 * @param {object} options
 * @param {'embedded'|'openai'|'anthropic'|'groq'|'ollama'} options.provider
 * @param {string} options.prompt   Already carries the system guardrail.
 * @param {string|null} [options.imageBase64]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]      Required for hosted providers.
 * @param {string} [options.endpoint]    Ollama only.
 * @returns {Promise<string>} The assistant's reply.
 */
async function runProviderInference(options) {
  const { provider, prompt, imageBase64 = null } = options || {};
  const model = options?.model;

  if (provider === 'embedded') {
    throw new ProviderError('The local model does not go through this path.');
  }

  if (provider === 'ollama') {
    const endpoint = (options?.endpoint || PROVIDER_DEFAULTS.ollama.baseUrl).replace(/\/+$/, '');
    return runOllama({ prompt, imageBase64, endpoint, model: model || 'llava' });
  }

  const apiKey = (options?.apiKey || '').trim();
  if (!apiKey) {
    throw new ProviderError(`No API key is stored for ${provider}. Add one in Settings.`);
  }

  if (provider === 'anthropic') {
    return runAnthropic({ prompt, imageBase64, apiKey, model: model || 'claude-3-5-sonnet-20241022' });
  }

  if (provider === 'openai' || provider === 'groq') {
    const baseUrl = PROVIDER_DEFAULTS[provider].baseUrl;
    return runOpenAiCompatible({
      prompt,
      imageBase64,
      apiKey,
      model: model || (provider === 'openai' ? 'gpt-4o' : 'llama-3.3-70b-versatile'),
      baseUrl,
    });
  }

  throw new ProviderError(`Unknown provider "${provider}".`);
}

module.exports = { runProviderInference, ProviderError, PROVIDER_DEFAULTS };
