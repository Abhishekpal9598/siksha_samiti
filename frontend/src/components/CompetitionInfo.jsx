import React from 'react';

export default function CompetitionInfo({ t, onActionClick }) {
  return (
    <section id="competitions" className="section-padding bg-page">
      <div className="container">
        {/* Section Header */}
        <div className="section-header text-center">
          <span className="section-badge">{t.infoBadge}</span>
          <h2 className="section-title">{t.infoHeading}</h2>
          <p className="section-subtitle">{t.infoSubheading}</p>
        </div>

        {/* Official Status Card - NO FAKE DATA */}
        <div className="card official-notice-card">
          <div className="notice-header">
            <span className="badge badge-warning">
              🔔 {t.statusBadge}
            </span>
            <span className="notice-date">{t.noticeSession}</span>
          </div>

          <h3 className="notice-title">{t.statusTitle}</h3>
          <p className="notice-body">{t.statusDesc}</p>

          <div className="notice-grid">
            <div className="notice-item">
              <div className="item-icon">🎓</div>
              <div>
                <h4 className="item-title">{t.eligibilityTitle}</h4>
                <p className="item-desc">{t.eligibilityDesc}</p>
              </div>
            </div>

            <div className="notice-item">
              <div className="item-icon">📊</div>
              <div>
                <h4 className="item-title">{t.markingTitle}</h4>
                <p className="item-desc">{t.markingDesc}</p>
              </div>
            </div>

            <div className="notice-item">
              <div className="item-icon">🔒</div>
              <div>
                <h4 className="item-title">{t.resultPolicyTitle}</h4>
                <p className="item-desc">{t.resultPolicyDesc}</p>
              </div>
            </div>
          </div>

          <div className="notice-footer">
            <button 
              className="btn btn-primary"
              onClick={() => onActionClick(t.studentRegister)}
            >
              {t.btnRegisterNotice}
            </button>
            <span className="notice-hint">
              {t.noticeHint}
            </span>
          </div>
        </div>

        {/* 4-Step Participation Guide */}
        <div id="steps" className="steps-container">
          <div className="section-header text-center" style={{ marginTop: '3.5rem', marginBottom: '2rem' }}>
            <h3 className="section-title" style={{ fontSize: '1.5rem' }}>{t.stepsHeading}</h3>
            <p className="section-subtitle">{t.stepsSubheading}</p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h4 className="step-title">{t.step1Title}</h4>
              <p className="step-desc">{t.step1Desc}</p>
            </div>

            <div className="step-card">
              <div className="step-number">2</div>
              <h4 className="step-title">{t.step2Title}</h4>
              <p className="step-desc">{t.step2Desc}</p>
            </div>

            <div className="step-card">
              <div className="step-number">3</div>
              <h4 className="step-title">{t.step3Title}</h4>
              <p className="step-desc">{t.step3Desc}</p>
            </div>

            <div className="step-card">
              <div className="step-number">4</div>
              <h4 className="step-title">{t.step4Title}</h4>
              <p className="step-desc">{t.step4Desc}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
