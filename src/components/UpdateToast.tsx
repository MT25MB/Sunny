import { useEffect, useState } from 'react';
import { X, Download, RotateCcw, CheckCircle } from 'lucide-react';

interface UpdateToastProps {
  onRestart: () => void;
}

type Phase = 'available' | 'downloading' | 'ready';

export function UpdateToast({ onRestart }: UpdateToastProps) {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('available');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubAvailable = window.electronAPI.onUpdateAvailable?.((info) => {
      setVersion(info.version || '');
      setPhase('available');
      setError('');
      setVisible(true);
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded?.((info) => {
      setVersion(info.version || '');
      setPhase('ready');
      setVisible(true);
    });

    const unsubError = window.electronAPI.onUpdateError?.((message) => {
      console.warn('[Sunny] Update error:', message);
      setError(message);
      setPhase('available');
    });

    return () => {
      unsubAvailable?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, []);

  // Downloads are opt-in, so the toast asks before anything is fetched.
  const handleDownload = () => {
    if (!window.electronAPI?.downloadUpdate) return;
    // Guard against double-clicks: the button only disappears on
    // re-render, so two rapid taps would fire downloadUpdate twice.
    if (phase === 'downloading') return;
    setPhase('downloading');
    void window.electronAPI.downloadUpdate().then((result) => {
      if (!result?.success) {
        setPhase('available');
        setError(result?.error || 'The update could not be downloaded.');
      }
    });
  };

  if (!visible) return null;

  const downloaded = phase === 'ready';

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <div className="toast-icon">
        {downloaded ? (
          <CheckCircle size={20} className="toast-icon-success" />
        ) : phase === 'downloading' ? (
          <RotateCcw size={20} className="toast-icon-spin" aria-hidden="true" />
        ) : (
          <Download size={20} aria-hidden="true" />
        )}
      </div>
      <div className="toast-content">
        <span className="toast-message">
          {downloaded
            ? `Update v${version} ready — restart to apply`
            : phase === 'downloading'
              ? `Downloading update v${version}…`
              : `Update v${version} is available`}
        </span>
        {version && !downloaded && (
          <span className="toast-version">Version {version}</span>
        )}
        {error && <span className="toast-error">{error}</span>}
      </div>
      {downloaded ? (
        <button className="toast-btn toast-btn-primary" onClick={onRestart}>
          Restart Now
        </button>
      ) : phase === 'available' ? (
        <button className="toast-btn toast-btn-primary" onClick={handleDownload}>
          Download
        </button>
      ) : null}
      <button className="toast-btn toast-btn-dismiss" onClick={() => setVisible(false)} aria-label="Dismiss update notification">
        <X size={16} />
      </button>
    </div>
  );
}