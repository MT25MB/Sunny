/**
 * Find a chat-capable LLM already running on the machine (Ollama).
 *
 * The embedded Moondream model is a small vision model: it can look at a
 * screenshot but it cannot hold a conversation. Sunny needs a real LLM for
 * chat. This module discovers one locally, so no account, API key or network
 * service is required, and caches the result to keep every message fast.
 */

'use strict';

const DEFAULT_ENDPOINT = 'http://localhost:11434';
const CACHE_MS = 60_000;
// A model above this size regularly fails to load on an ordinary laptop
// (Ollama tries to reserve an 8 GB context buffer and runs out of memory).
const MAX_MODEL_BYTES = 2.6 * 1024 ** 3;

/** @type {{ endpoint: string, at: number, model: string | null } | null} */
let cached = null;

/**
 * @param {string} [endpoint] Ollama base URL, already validated by the caller.
 * @returns {Promise<string | null>} a model name, or null when none is usable
 */
async function detectLocalChatModel(endpoint = DEFAULT_ENDPOINT) {
  const base = String(endpoint || DEFAULT_ENDPOINT);
  const now = Date.now();
  if (cached && cached.endpoint === base && now - cached.at < CACHE_MS) {
    return cached.model;
  }

  let model = null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    let response;
    try {
      response = await fetch(new URL('/api/tags', url).toString(), {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`tags returned ${response.status}`);

    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    const usable = models.filter((m) => {
      const name = String(m?.name || '');
      if (!name) return false;
      const size = Number(m?.size || 0);
      return size > 0 && size <= MAX_MODEL_BYTES;
    });
    // Prefer an instruct/chat tuned model, then the smallest that fits.
    usable.sort((a, b) => {
      const aScore = /instruct|chat/i.test(a.name) ? 0 : 1;
      const bScore = /instruct|chat/i.test(b.name) ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return Number(a.size || 0) - Number(b.size || 0);
    });
    model = usable[0]?.name || null;
  } catch {
    model = null;
  }

  cached = { endpoint: base, at: now, model };
  return model;
}

/** Forget the cached discovery result (used when the endpoint changes). */
function resetLocalModelCache() {
  cached = null;
}

module.exports = { detectLocalChatModel, resetLocalModelCache, DEFAULT_ENDPOINT };
