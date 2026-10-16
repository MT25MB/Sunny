import React from "react";

interface OfflineFallbackProps {
  onRetry?: () => void;
  reason?: string;
}

export default function OfflineFallback({ onRetry, reason }: OfflineFallbackProps): JSX.Element {
  return (
    <section className="offline-fallback" role="status" aria-live="polite">
      <div className="offline-icon" aria-hidden="true">&#9888;</div>
      <h2>Sunny is currently offline</h2>
      <p>
        {reason ? reason + " " : ""}
        Some features require the local AI model or an internet connection.
      </p>
      <ul className="offline-troubleshooting">
        <li>Check your internet connection</li>
        <li>Restart the Sunny desktop app</li>
        <li>If using Ollama, make sure it is running and the model is downloaded</li>
        <li>Try again in a few minutes</li>
      </ul>
      <div className="offline-actions">
        <button onClick={onRetry} className="offline-retry-btn">
          &#8634; Try Again
        </button>
      </div>
      <p className="offline-note">
        Text input and chat history still work offline. Some AI-powered features may be limited.
      </p>
    </section>
  );
}

