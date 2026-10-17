export default function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="footer-container">
        <div className="footer-brand">
          <span className="footer-logo" aria-hidden="true">&#9733;</span>
          <div>
            <strong>Sunny</strong>
            <p className="footer-tagline">Desktop Companion for Older Adults</p>
          </div>
        </div>
        <nav className="footer-nav" aria-label="Footer navigation">
          <ul>
            {/* Absolute URLs only: relative paths resolve against the packaged
                file:// bundle and would try to navigate the app window away
                from the UI. The main process opens these in the browser. */}
            <li><a href="https://mt25mb.github.io/Sunny/" target="_blank" rel="noopener noreferrer">Home</a></li>
            <li><a href="https://mt25mb.github.io/Sunny/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
            <li><a href="https://mt25mb.github.io/Sunny/terms-of-service.html" target="_blank" rel="noopener noreferrer">Terms of Service</a></li>
            <li><a href="https://github.com/MT25MB/Sunny" target="_blank" rel="noopener noreferrer">GitHub Repository</a></li>
            <li><a href="https://github.com/MT25MB/Sunny/releases" target="_blank" rel="noopener noreferrer">Releases</a></li>
          </ul>
        </nav>
        <div className="footer-note">
          <p>Free and open source software. No accounts, no ads, no tracking.</p>
        </div>
      </div>
    </footer>
  );
}

