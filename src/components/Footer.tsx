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
            <li><a href="/">Home</a></li>
            <li><a href="privacy-policy.html">Privacy Policy</a></li>
            <li><a href="terms-of-service.html">Terms of Service</a></li>
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

