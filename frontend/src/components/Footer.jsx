import React from 'react';

export default function Footer({ t, healthData, healthState }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="site-footer">
      <div className="container footer-content">
        {/* Brand & Purpose */}
        <div className="footer-col brand-col">
          <div className="footer-brand">
            <div className="footer-logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
                <path d="M6 6h10"></path>
                <path d="M6 10h10"></path>
              </svg>
            </div>
            <span className="footer-title">{t.footerTitle}</span>
          </div>
          <p className="footer-desc">
            {t.footerSubtitle}
          </p>

          {/* Discreet live system indicator */}
          <div className="footer-status-pill">
            <span className={`status-indicator ${healthState === 'connected' ? 'status-online' : healthState === 'loading' ? 'status-loading' : 'status-offline'}`}></span>
            <span>
              {healthState === 'connected' 
                ? t.footerStatusOnline 
                : healthState === 'loading' 
                ? t.footerStatusLoading 
                : t.footerStatusOffline}
            </span>
          </div>
        </div>

        {/* Quick Links */}
        <div className="footer-col links-col">
          <h4 className="footer-heading">{t.footerLinks}</h4>
          <ul className="footer-links-list">
            <li><button onClick={() => scrollTo('hero')}>{t.navHome}</button></li>
            <li><button onClick={() => scrollTo('modes')}>{t.navModes}</button></li>
            <li><button onClick={() => scrollTo('competitions')}>{t.navCompetitions}</button></li>
            <li><button onClick={() => scrollTo('steps')}>{t.navGuidelines}</button></li>
          </ul>
        </div>

        {/* Help & Contact Placeholder */}
        <div className="footer-col help-col">
          <h4 className="footer-heading">{t.footerHelpline}</h4>
          <p className="footer-desc">
            {t.footerHelplineNote}
          </p>
          <div className="footer-support-card">
            <span>{t.footerHelplinePhone}</span>
            <span>{t.footerExamCenter}</span>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-content">
          <p>{t.footerCopyright}</p>
          <p className="footer-subtext">{t.footerPrivacy}</p>
        </div>
      </div>
    </footer>
  );
}
