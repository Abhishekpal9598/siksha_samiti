import React from 'react';

export default function ExamModes({ t }) {
  return (
    <section id="modes" className="section-padding bg-surface">
      <div className="container">
        <div className="section-header text-center">
          <span className="section-badge">{t.modesBadge}</span>
          <h2 className="section-title">{t.modesHeading}</h2>
          <p className="section-subtitle">{t.modesSubheading}</p>
        </div>

        <div className="modes-grid">
          {/* Online MCQ Card */}
          <div className="mode-card mode-online">
            <div className="mode-card-header">
              <div className="mode-icon-wrapper online-icon-bg">
                💻
              </div>
              <div>
                <span className="mode-tag tag-blue">{t.onlineSubtitle}</span>
                <h3 className="mode-title">{t.onlineTitle}</h3>
              </div>
            </div>

            <p className="mode-desc">{t.onlineDesc}</p>

            <ul className="mode-features-list">
              <li>
                <span className="feature-check">✓</span>
                <span>{t.onlineFeature1}</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>{t.onlineFeature2}</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>{t.onlineFeature3}</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>{t.onlineFeature4}</span>
              </li>
            </ul>

            <div className="mode-footer-pill">
              {t.onlineFooterPill}
            </div>
          </div>

          {/* Paper OMR Sheet Card */}
          <div className="mode-card mode-omr">
            <div className="mode-card-header">
              <div className="mode-icon-wrapper omr-icon-bg">
                📄
              </div>
              <div>
                <span className="mode-tag tag-amber">{t.omrSubtitle}</span>
                <h3 className="mode-title">{t.omrTitle}</h3>
              </div>
            </div>

            <p className="mode-desc">{t.omrDesc}</p>

            <ul className="mode-features-list">
              <li>
                <span className="feature-check">✓</span>
                <span>{t.omrFeature1}</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>{t.omrFeature2}</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>{t.omrFeature3}</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>{t.omrFeature4}</span>
              </li>
            </ul>

            <div className="mode-footer-pill">
              {t.omrFooterPill}
            </div>
          </div>
        </div>

        {/* Centralized Scoring Engine Notice Banner */}
        <div className="scoring-unification-banner">
          <div className="banner-icon">⚖️</div>
          <div className="banner-text">
            <strong>{t.scoringEngineTitle}</strong> {t.commonScoringNotice}
          </div>
        </div>
      </div>
    </section>
  );
}
