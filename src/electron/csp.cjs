/**
 * CSP header rewrite — pure, no Electron dependency.
 *
 * Input:  responseHeaders = Record<string, string[]> | undefined
 * Output: new Record<string, string[]> with any existing CSP removed and
 *         our strict policy inserted.
 *
 * Electron's onHeadersReceived delivers and expects the object form
 * (Record<string, string[]>), not the chrome.webRequest array-of-objects.
 * A handler that throws before calling callback() stalls the request
 * forever, which is how one bad header makes the whole app hang.
 */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: https:",
  // Loopback is allowed because `ollama_endpoint` is user-configurable in
  // Settings (default http://localhost:11434). Local inference is the
  // product's headline feature and 'self' does not cover loopback.
  // Safe here: the renderer is sandboxed with script-src 'self', so only
  // bundled code can issue these requests.
  "connect-src 'self' https://www.themealdb.com https://api.open-meteo.com https://api.rss2json.com https://ip-api.com https://html.duckduckgo.com https://api.openai.com https://api.anthropic.com https://api.groq.com http://localhost:* http://127.0.0.1:*",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * Remove any existing CSP header (case-insensitive) and insert ours.
 * Never mutates the input.
 * @param {Record<string, string[]> | undefined} incoming
 * @returns {Record<string, string[]>}
 */
function withCsp(incoming) {
  const out = { ...(incoming || {}) };
  for (const key of Object.keys(out)) {
    if (key.toLowerCase() === 'content-security-policy') {
      delete out[key];
    }
  }
  out['Content-Security-Policy'] = [CSP];
  return out;
}

module.exports = { withCsp, CSP };