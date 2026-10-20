import React, { useState } from 'react';

export default function Header({ lang, setLang, t, healthState, onActionClick }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (sectionId) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="site-header">
      {/* Top Utility Bar */}
      <div className="top-bar">
        <div className="container top-bar-content">
          <div className="system-health-pill">
            <span className={`status-indicator ${healthState === 'connected' ? 'status-online' : healthState === 'loading' ? 'status-loading' : 'status-offline'}`}></span>
            <span className="health-text">
              {healthState === 'connected' ? t.systemOnline : healthState === 'loading' ? t.connecting : t.systemOffline}
            </span>
          </div>

          <div className="top-actions">
            {/* Segmented language switcher - shows active language and options unambiguously */}
            <div className="lang-switcher" role="group" aria-label={t.langSwitcherLabel}>
              <button 
                type="button"
                className={`lang-option-btn ${lang === 'hi' ? 'active' : ''}`}
                onClick={() => setLang('hi')}
                aria-pressed={lang === 'hi'}
                title="हिंदी भाषा चुनें"
              >
                हिंदी
              </button>
              <button 
                type="button"
                className={`lang-option-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
                title="Select English language"
              >
                English
              </button>
            </div>

            <button 
              type="button"
              className="admin-link-btn"
              onClick={() => onActionClick(t.adminLogin)}
            >
              🔐 {t.adminLogin}
            </button>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="main-nav-bar">
        <div className="container main-nav-content">
          {/* Logo & Identity */}
          <div className="brand" onClick={() => handleNav('hero')} style={{ cursor: 'pointer' }}>
            <div className="brand-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
                <path d="M6 6h10"></path>
                <path d="M6 10h10"></path>
                <path d="M6 14h6"></path>
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-title">{t.systemTitle}</span>
              <span className="brand-subtitle">{t.systemSubtitle}</span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="desktop-nav">
            <button className="nav-item" onClick={() => handleNav('hero')}>{t.navHome}</button>
            <button className="nav-item" onClick={() => handleNav('modes')}>{t.navModes}</button>
            <button className="nav-item" onClick={() => handleNav('competitions')}>{t.navCompetitions}</button>
            <button className="nav-item" onClick={() => handleNav('steps')}>{t.navGuidelines}</button>
          </nav>

          {/* Desktop Auth CTAs */}
          <div className="desktop-auth-buttons">
            <button 
              className="btn btn-outline btn-sm"
              onClick={() => onActionClick(t.studentLogin)}
            >
              {t.studentLogin}
            </button>
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => onActionClick(t.studentRegister)}
            >
              {t.studentRegister}
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="mobile-drawer">
          <div className="container mobile-drawer-content">
            {/* Mobile Language Switcher */}
            <div className="mobile-lang-row">
              <span className="mobile-lang-label">🌐 {t.langSwitcherLabel}:</span>
              <div className="lang-switcher">
                <button 
                  type="button"
                  className={`lang-option-btn ${lang === 'hi' ? 'active' : ''}`}
                  onClick={() => setLang('hi')}
                >
                  हिंदी
                </button>
                <button 
                  type="button"
                  className={`lang-option-btn ${lang === 'en' ? 'active' : ''}`}
                  onClick={() => setLang('en')}
                >
                  English
                </button>
              </div>
            </div>

            <div className="mobile-auth-divider"></div>

            <button className="mobile-nav-item" onClick={() => handleNav('hero')}>🏠 {t.navHome}</button>
            <button className="mobile-nav-item" onClick={() => handleNav('modes')}>📝 {t.navModes}</button>
            <button className="mobile-nav-item" onClick={() => handleNav('competitions')}>🏆 {t.navCompetitions}</button>
            <button className="mobile-nav-item" onClick={() => handleNav('steps')}>📋 {t.navGuidelines}</button>
            
            <div className="mobile-auth-divider"></div>
            
            <button 
              className="btn btn-primary w-full"
              onClick={() => { setMobileMenuOpen(false); onActionClick(t.studentRegister); }}
            >
              ✍️ {t.studentRegister}
            </button>
            <button 
              className="btn btn-outline w-full"
              onClick={() => { setMobileMenuOpen(false); onActionClick(t.studentLogin); }}
            >
              🔑 {t.studentLogin}
            </button>
            <button 
              className="btn btn-subtle w-full"
              onClick={() => { setMobileMenuOpen(false); onActionClick(t.adminLogin); }}
            >
              🔐 {t.adminLogin}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
