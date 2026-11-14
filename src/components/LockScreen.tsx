import { useState, useCallback } from 'react';

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const handleDigit = useCallback((digit: string) => {
    if (pin.length < 6) {
      setPin((p) => p + digit);
      setError(null);
    }
  }, [pin]);

  const handleBackspace = useCallback(() => {
    setPin((p) => p.slice(0, -1));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI?.verifyPin?.(pin);
      if (result?.success) {
        onUnlock();
      } else if (result?.locked) {
        setLockedOut(true);
        setRemainingSeconds(result.remainingSeconds);
        setError('Too many failed attempts. Please wait.');
        // Countdown timer
        const interval = setInterval(() => {
          setRemainingSeconds((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              setLockedOut(false);
              setError(null);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError('Incorrect PIN. ' + (result?.attemptsRemaining ? result.attemptsRemaining + ' attempts remaining.' : ''));
        setPin('');
      }
    } catch (e) {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pin, onUnlock]);

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label="PIN lock screen">
      <div className="lock-screen-content">
        <h1 className="lock-title">Sunny is Locked</h1>
        <p className="lock-subtitle">Enter your PIN to continue</p>

        <div className="pin-display" aria-label="PIN entry">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={'pin-dot' + (i < pin.length ? ' filled' : '')} />
          ))}
        </div>

        {error && (
          <p className="lock-error" role="alert">{error}</p>
        )}

        {lockedOut && (
          <p className="lock-countdown">Locked for {remainingSeconds} seconds</p>
        )}

        <div className="pin-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((key, i) => {
            if (key === '') return <div key={i} className="pin-key-empty" />;
            if (key === 'back') {
              return (
                <button
                  key={i}
                  className="pin-key pin-key-back"
                  onClick={handleBackspace}
                  disabled={loading || lockedOut}
                  aria-label="Backspace"
                >
                  ←
                </button>
              );
            }
            return (
              <button
                key={i}
                className="pin-key"
                onClick={() => handleDigit(key)}
                disabled={loading || lockedOut}
                aria-label={'Digit ' + key}
              >
                {key}
              </button>
            );
          })}
        </div>

        <button
          className="pin-submit-btn"
          onClick={handleSubmit}
          disabled={loading || lockedOut || pin.length < 4}
          aria-label="Submit PIN"
        >
          {loading ? 'Verifying...' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}
