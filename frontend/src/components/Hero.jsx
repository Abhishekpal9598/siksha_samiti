import React from 'react';

export default function Hero({ t, onActionClick }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="hero" className="hero-section">
      <div className="container hero-container">
        {/* Announcement Badge */}
        <div className="hero-badge">
          <span className="badge-sparkle">✨</span>
          <span>{t.heroBadge}</span>
        </div>

        {/* Main Heading */}
        <h1 className="hero-title">
          {t.heroHeading}
        </h1>

        {/* Subtitle Description */}
        <p className="hero-description">
          {t.heroSubheading}
        </p>

        {/* Call to Actions */}
        <div className="hero-actions">
          <button 
            className="btn btn-primary btn-lg"
            onClick={() => onActionClick(t.studentRegister)}
          >
            <span>✍️</span> {t.ctaRegister}
          </button>
          
          <button 
            className="btn btn-secondary btn-lg"
            onClick={() => onActionClick(t.studentLogin)}
          >
            <span>🔑</span> {t.ctaLogin}
          </button>

          <button 
            className="btn btn-outline btn-lg"
            onClick={() => scrollTo('competitions')}
          >
            <span>📋</span> {t.ctaViewInfo}
          </button>
        </div>

        {/* Feature Pills */}
        <div className="hero-features">
          <div className="feature-pill">
            <span className="pill-icon">🛡️</span>
            <span>{t.badgeTransparent}</span>
          </div>
          <div className="feature-pill">
            <span className="pill-icon">⚡</span>
            <span>{t.badgeDualMode}</span>
          </div>
          <div className="feature-pill">
            <span className="pill-icon">🎯</span>
            <span>{t.badgeSingleResult}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
