import { useEffect, useState } from 'react';
import { X, Download, RotateCcw, CheckCircle } from 'lucide-react';

interface UpdateToastProps {
  onRestart: () => void;
}

export function UpdateToast({ onRestart }: UpdateToastProps) {
  const [visible, setVisible] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubAvailable = window.electronAPI.onUpdateAvailable?.((info) => {
      setVersion(info.version || '');
      setDownloaded(false);
      setVisible(true);
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded?.((info) => {
      setVersion(info.version || '');
      setDownloaded(true);
      setVisible(true);
    });

    const unsubError = window.electronAPI.onUpdateError?.((message) => {
      console.warn('[Sunny] Update error:', message);
    });

    return () => {
      unsubAvailable?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <div className="toast-icon">
        {downloaded ? (
          <CheckCircle size={20} className="toast-icon-success" />
        ) : (
          <>
            <Download size={20} className="toast-icon-spin" aria-hidden="true" />
            <RotateCcw size={20} className="toast-icon-spin" aria-hidden="true" />
          </>
        )}
      </div>
      <div className="toast-content">
        <span className="toast-message">
          {downloaded
            ? `Update v${version} ready — restart to apply`
            : `Downloading update v${version}…`}
        </span>
        {version && !downloaded && (
          <span className="toast-version">Version {version}</span>
        )}
      </div>
      {downloaded && (
        <button className="toast-btn toast-btn-primary" onClick={onRestart}>
          Restart Now
        </button>
      )}
      <button className="toast-btn toast-btn-dismiss" onClick={() => setVisible(false)} aria-label="Dismiss update notification">
        <X size={16} />
      </button>
    </div>
  );
}