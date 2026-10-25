import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export default function StudentDashboard({ user, onLogout, lang, setLang, t, onStartExam }) {
  const [loggingOut, setLoggingOut] = useState(false);

  // Published Competitions & Student Registrations State
  const [competitions, setCompetitions] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [myResults, setMyResults] = useState([]);
  const [publicMeritModal, setPublicMeritModal] = useState({ open: false, competitionTitle: '', list: [], loading: false, error: null });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successAlert, setSuccessAlert] = useState(null);

  // Registration Modal State
  const [registeringComp, setRegisteringComp] = useState(null);
  const [chosenMode, setChosenMode] = useState('ONLINE_MCQ');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [regModalError, setRegModalError] = useState(null);

  const getMutationHeaders = () => ({
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  });

  // Fetch published competitions, student's registrations and published results
  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [compsRes, regsRes, resultsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/competitions`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/me/registrations`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/me/results`, { credentials: 'include' })
      ]);

      const compsData = await compsRes.json();
      const regsData = await regsRes.json();
      const resultsData = await resultsRes.json();

      if (compsRes.ok && compsData.success) {
        setCompetitions(compsData.competitions || []);
      }
      if (regsRes.ok && regsData.success) {
        setRegistrations(regsData.registrations || []);
      }
      if (resultsRes.ok && resultsData.success) {
        setMyResults(resultsData.results || []);
      }
    } catch (err) {
      console.warn('Failed to load student data:', err);
      setErrorMsg(err.message || 'Error loading competition information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fetchPublicMerit = async (compId, title) => {
    setPublicMeritModal({ open: true, competitionTitle: title, list: [], loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE_URL}/competitions/${compId}/public-merit-list`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPublicMeritModal({ open: true, competitionTitle: title, list: data.meritList || [], loading: false, error: null });
      } else {
        setPublicMeritModal({ open: true, competitionTitle: title, list: [], loading: false, error: data.error?.message || 'Public merit list not available.' });
      }
    } catch (err) {
      setPublicMeritModal({ open: true, competitionTitle: title, list: [], loading: false, error: err.message || 'Error fetching merit list.' });
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include'
      });
    } catch (err) {
      console.warn('Logout request failed:', err);
    } finally {
      setLoggingOut(false);
      onLogout();
    }
  };

  // Check if student is already registered for a competition
  const getRegistrationForComp = (compId) => {
    return registrations.find((r) => {
      const cId = r.competition?.id || r.competition?._id || r.competitionId;
      return cId === compId;
    });
  };

  // Eligibility check: student's class matches one of competition's eligibleClasses
  const checkEligibility = (comp) => {
    if (!comp.eligibleClasses || !user?.classOrGrade) return false;
    const studentClass = user.classOrGrade.trim().toLowerCase();
    const allowed = Array.isArray(comp.eligibleClasses) ? comp.eligibleClasses : [comp.eligibleClasses];
    return allowed.some((c) => c.trim().toLowerCase() === studentClass);
  };

  // Timeline check
  const checkRegistrationWindow = (comp) => {
    const now = new Date();
    if (comp.registrationOpensAt && now < new Date(comp.registrationOpensAt)) {
      return 'NOT_OPEN';
    }
    if (comp.registrationClosesAt && now > new Date(comp.registrationClosesAt)) {
      return 'CLOSED';
    }
    return 'OPEN';
  };

  // Open Registration Modal
  const openRegisterModal = (comp) => {
    setRegisteringComp(comp);
    // If competition specifies single mode, default to it
    if (comp.mode === 'OMR') {
      setChosenMode('OMR');
    } else {
      setChosenMode('ONLINE_MCQ');
    }
    setRegModalError(null);
  };

  // Submit Registration
  const handleConfirmRegister = async (e) => {
    e.preventDefault();
    if (!registeringComp) return;

    setRegisterSubmitting(true);
    setRegModalError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/competitions/${registeringComp.id}/register`, {
        method: 'POST',
        headers: getMutationHeaders(),
        body: JSON.stringify({ examMode: chosenMode }),
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const assignedRoll = data.registration?.rollNumber;
        setSuccessAlert({
          compTitle: registeringComp.title,
          rollNumber: assignedRoll,
          mode: data.registration?.examMode
        });
        setRegisteringComp(null);
        await loadData();
      } else {
        setRegModalError(data.error?.message || (data.error?.details && data.error.details.join(', ')) || 'Registration failed.');
      }
    } catch (err) {
      setRegModalError(err.message || 'Network error submitting registration.');
    } finally {
      setRegisterSubmitting(false);
    }
  };

  return (
    <div className="dashboard-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-page)' }}>
      {/* Dashboard Top Header */}
      <header className="site-header" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="main-nav-bar" style={{ borderBottom: '1px solid var(--color-border)', background: '#FFFFFF' }}>
          <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem' }}>
            <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="brand-logo" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', width: '38px', height: '38px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                🎓
              </div>
              <div className="brand-text">
                <span className="brand-title" style={{ fontSize: '1rem', fontWeight: 700, display: 'block' }}>
                  {t.systemTitle}
                </span>
                <span className="brand-subtitle" style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                  {t.dashboardStudentTitle}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Language Switcher */}
              <div className="lang-switcher" role="group" aria-label={t.langSwitcherLabel}>
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

              {/* Logout Button */}
              <button 
                className="btn btn-outline btn-sm" 
                onClick={handleLogout}
                disabled={loggingOut}
                style={{ borderColor: '#CBD5E1', color: 'var(--color-danger)' }}
              >
                <span>🚪</span>
                <span>{loggingOut ? t.loggingOut : t.btnLogout}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Area */}
      <main className="container" style={{ padding: '2rem 1.25rem', flex: 1 }}>
        {/* Registration Success Celebration Pill */}
        {successAlert && (
          <div style={{
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            color: '#FFFFFF',
            borderRadius: 'var(--radius-card)',
            padding: '1.5rem 2rem',
            marginBottom: '2rem',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, display: 'block', marginBottom: '0.25rem' }}>
                🎉 {t.registrationSuccess}
              </span>
              <p style={{ margin: 0, opacity: 0.95, fontSize: '0.9rem' }}>
                {successAlert.compTitle} &bull; {lang === 'hi' ? 'माध्यम' : 'Mode'}: <strong>{successAlert.mode === 'OMR' ? '✍️ Paper OMR' : '📱 Online MCQ'}</strong>
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.75rem 1.25rem', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>
              <span style={{ fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.rollNumberLabel}</span>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '0.08em' }}>{successAlert.rollNumber}</span>
            </div>
          </div>
        )}

        {/* Welcome Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1E40AF 0%, #1D4ED8 100%)',
          color: '#FFFFFF',
          borderRadius: 'var(--radius-card)',
          padding: '2rem',
          marginBottom: '2rem',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.15)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              <span>✨</span>
              <span>{t.roleStudent}</span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
              {t.welcomeUser}, {user?.fullName}!
            </h1>
            <p style={{ opacity: 0.9, fontSize: '0.95rem', margin: 0, maxWidth: '600px' }}>
              {user?.school} &bull; {user?.classOrGrade}
            </p>
          </div>

          <div style={{ textAlign: 'right', background: 'rgba(255,255,255,0.1)', padding: '0.75rem 1.25rem', borderRadius: '12px' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.85 }}>{t.accountStatus}</span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#86EFAC' }}>● {t.statusActive}</span>
          </div>
        </div>

        {/* Profile Card & Info Card */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>👤</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t.profileCardTitle}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-muted)' }}>{lang === 'hi' ? 'नाम' : 'Full Name'}:</span>
                <span style={{ fontWeight: 600 }}>{user?.fullName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-muted)' }}>{t.mobileLabel}:</span>
                <span style={{ fontWeight: 600 }}>{user?.mobileNormalized}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-muted)' }}>{t.schoolLabel}:</span>
                <span style={{ fontWeight: 600 }}>{user?.school}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-muted)' }}>{t.classLabel}:</span>
                <span style={{ fontWeight: 700, color: '#1E40AF' }}>{user?.classOrGrade}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>📝</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t.examModesCardTitle}</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
              {t.examModesCardDesc}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontSize: '0.8rem', padding: '0.3rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
                📱 Online MCQ
              </span>
              <span style={{ background: '#FEF3C7', color: '#B45309', fontSize: '0.8rem', padding: '0.3rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
                ✍️ OMR Sheet
              </span>
            </div>
          </div>
        </div>

        {/* ================= SECTION 1: MY REGISTERED COMPETITIONS ================= */}
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.75rem', marginBottom: '2rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🎟️</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t.myRegistrations}</h3>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <span>⏳ {t.connecting}</span>
            </div>
          ) : registrations.length === 0 ? (
            <div style={{
              background: 'var(--color-page)',
              border: '1px dashed var(--color-border)',
              borderRadius: '12px',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', margin: 0 }}>
                {t.noRegistrationsYet}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {registrations.map((reg) => (
                <div
                  key={reg.id}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    padding: '1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                        {reg.competition?.title || 'Academic Competition'}
                      </h4>
                      <span style={{ background: '#DCFCE7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                        ● {t.statusConfirmed}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--color-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>📅 {t.examDateLabel}: <strong>{reg.competition?.examDate ? reg.competition.examDate.split('T')[0] : 'N/A'}</strong></span>
                      <span>⏰ {t.examTimeLabel}: <strong>{reg.competition?.startTime} - {reg.competition?.endTime}</strong></span>
                      <span>⏳ {t.durationLabel}: <strong>{reg.competition?.durationMinutes} {lang === 'hi' ? 'मिनट' : 'mins'}</strong></span>
                    </div>
                  </div>

                  {/* Roll Number Card */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '0.5rem 1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>
                        {t.rollNumberLabel}
                      </span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E3A8A', letterSpacing: '0.05em' }}>
                        {reg.rollNumber}
                      </span>
                    </div>

                    <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', padding: '0.5rem 0.85rem', borderRadius: '8px' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: '#92400E', fontWeight: 600 }}>
                        {t.confirmedModeLabel}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#B45309' }}>
                        {reg.examMode === 'OMR' ? '✍️ Paper OMR' : '📱 Online MCQ'} (🔒 {lang === 'hi' ? 'लॉक' : 'Locked'})
                      </span>
                    </div>
                  </div>

                  {/* Phase 4: Exam Mode Notice or Action */}
                  {reg.examMode === 'OMR' ? (
                    <div style={{
                      width: '100%',
                      marginTop: '0.75rem',
                      padding: '0.75rem 1rem',
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                      color: '#92400E',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem'
                    }}>
                      <span style={{ fontSize: '1rem' }}>ℹ️</span>
                      <div>
                        <strong>{t.omrStudentNoticeTitle}:</strong> {t.omrStudentNoticeDesc}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      width: '100%',
                      marginTop: '0.75rem',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '1rem',
                      borderTop: '1px dashed var(--color-border)',
                      paddingTop: '0.75rem'
                    }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onStartExam && onStartExam(reg.competition?.id || reg.competitionId)}
                        style={{
                          padding: '0.55rem 1.25rem',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <span>🚀</span>
                        <span>{t.btnStartExam}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ================= SECTION 2: AVAILABLE COMPETITIONS ================= */}
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.75rem', marginBottom: '2rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🏆</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t.availableCompetitions}</h3>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <span>⏳ {t.connecting}</span>
            </div>
          ) : competitions.length === 0 ? (
            <div style={{
              background: 'var(--color-page)',
              border: '1px dashed var(--color-border)',
              borderRadius: '12px',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>⏳</span>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', margin: 0 }}>
                {t.noAvailableComps}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {competitions.map((comp) => {
                const existingReg = getRegistrationForComp(comp.id);
                const isEligible = checkEligibility(comp);
                const windowStatus = checkRegistrationWindow(comp);

                return (
                  <div
                    key={comp.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid var(--color-border)',
                      borderRadius: '10px',
                      padding: '1.5rem',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
                          {comp.title}
                        </h4>
                        <p style={{ fontSize: '0.875rem', color: '#475569', margin: 0, lineHeight: 1.5, maxWidth: '750px' }}>
                          {comp.description}
                        </p>
                      </div>

                      {/* Registration Action or Status Badge */}
                      <div>
                        {existingReg ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#DCFCE7', border: '1px solid #86EFAC', padding: '0.4rem 0.85rem', borderRadius: '6px' }}>
                            <span style={{ color: '#166534', fontWeight: 700, fontSize: '0.85rem' }}>
                              ✓ {t.alreadyRegistered}
                            </span>
                            <span style={{ background: '#166534', color: '#FFFFFF', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                              {existingReg.rollNumber}
                            </span>
                          </div>
                        ) : windowStatus === 'CLOSED' ? (
                          <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                            ⚠️ {t.registrationClosed}
                          </span>
                        ) : windowStatus === 'NOT_OPEN' ? (
                          <span style={{ background: '#FEF3C7', color: '#92400E', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                            ⏳ {t.registrationNotStarted}
                          </span>
                        ) : !isEligible ? (
                          <span style={{ background: '#F1F5F9', color: '#64748B', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                            🚫 {t.notEligible}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => openRegisterModal(comp)}
                            style={{ padding: '0.45rem 1rem' }}
                          >
                            📝 {t.registerForCompBtn}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Metadata Pill Box */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: '#F8FAFC', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.825rem', marginTop: '1rem' }}>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.examDateLabel}:</span>
                        <strong>{comp.examDate ? comp.examDate.split('T')[0] : 'N/A'}</strong> ({comp.startTime} - {comp.endTime})
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.durationLabel}:</span>
                        <strong>{comp.durationMinutes} {lang === 'hi' ? 'मिनट' : 'mins'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.eligibleClassesLabel}:</span>
                        <strong>{Array.isArray(comp.eligibleClasses) ? comp.eligibleClasses.join(', ') : comp.eligibleClasses}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.marksLabel}:</span>
                        <strong>{comp.totalMarks} {lang === 'hi' ? 'अंक' : 'Marks'}</strong> {comp.negativeMarking?.enabled ? `(Neg: -${comp.negativeMarking.deduction})` : ''}
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.competitionMode}:</span>
                        <strong>
                          {comp.mode === 'BOTH' ? t.modeBoth : comp.mode === 'ONLINE_MCQ' ? t.modeOnline : t.modeOmr}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ================= SECTION 3: MY EXAM RESULTS & SCORECARD ================= */}
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.75rem', marginBottom: '2rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t.myScorecard}</h3>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <span>⏳ {t.connecting}</span>
            </div>
          ) : myResults.length === 0 ? (
            <div style={{
              background: 'var(--color-page)',
              border: '1px dashed var(--color-border)',
              borderRadius: '12px',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🏅</span>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', margin: 0 }}>
                {t.noPublishedResults}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Privacy / Official Notice Banner */}
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#1E40AF', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span>🔒</span>
                <span>{t.scorecardNotice}</span>
              </div>

              {myResults.map((result) => (
                <div
                  key={result.id}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {/* Header: Rank Badge + Competition Name */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: '#1E40AF' }}>
                        {result.competitionTitle || result.competition?.title || (lang === 'hi' ? 'प्रतियोगिता' : 'Competition')}
                      </h4>
                      <div style={{ fontSize: '0.825rem', color: 'var(--color-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span>{t.rollNumberLabel}: <strong style={{ color: '#1E3A8A' }}>{result.rollNumber}</strong></span>
                        <span>{t.candidateName}: <strong>{result.studentName}</strong></span>
                      </div>
                    </div>

                    {/* Rank Badge */}
                    <div style={{
                      background: result.rank === 1 ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                        : result.rank === 2 ? 'linear-gradient(135deg, #94A3B8 0%, #64748B 100%)'
                        : result.rank === 3 ? 'linear-gradient(135deg, #CD7F32 0%, #A0522D 100%)'
                        : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                      color: '#FFFFFF',
                      padding: '0.6rem 1.1rem',
                      borderRadius: '10px',
                      textAlign: 'center',
                      minWidth: '80px'
                    }}>
                      <span style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                        {lang === 'hi' ? 'रैंक' : 'Rank'}
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1.1 }}>
                        {result.rank === 1 ? '🥇' : result.rank === 2 ? '🥈' : result.rank === 3 ? '🥉' : `#${result.rank}`}
                      </span>
                    </div>
                  </div>

                  {/* Score Overview Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    {/* Final Score — Highlighted */}
                    <div style={{ background: '#1E40AF', color: '#FFFFFF', borderRadius: '10px', padding: '0.85rem 1rem', textAlign: 'center', gridColumn: 'span 1' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.85, marginBottom: '0.2rem' }}>{t.finalScore}</span>
                      <span style={{ fontSize: '1.6rem', fontWeight: 900 }}>{result.finalScore}</span>
                      <span style={{ fontSize: '0.8rem', opacity: 0.8 }}> / {result.maximumMarks}</span>
                    </div>

                    {/* Correct Answers */}
                    <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '10px', padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: '#166534', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{t.correctAnswers}</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D' }}>✓ {result.correctAnswers}</span>
                    </div>

                    {/* Incorrect Answers */}
                    <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: '#991B1B', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{t.incorrectAnswers}</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B91C1C' }}>✗ {result.incorrectAnswers}</span>
                    </div>

                    {/* Unanswered */}
                    <div style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: '#475569', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{t.unanswered}</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#64748B' }}>— {result.unansweredQuestions}</span>
                    </div>
                  </div>

                  {/* Marks Breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.85rem 1rem', fontSize: '0.85rem', marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-muted)' }}>+ {t.positiveMarks}:</span>
                      <strong style={{ color: '#15803D' }}>+{result.positiveMarks}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-muted)' }}>− {t.negativeDeduction}:</span>
                      <strong style={{ color: result.negativeDeduction > 0 ? '#B91C1C' : '#64748B' }}>
                        {result.negativeDeduction > 0 ? `-${result.negativeDeduction}` : '0'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-muted)' }}>{t.scoringVersion}:</span>
                      <strong>v{result.scoringVersion || 1}</strong>
                    </div>
                    {result.evaluatedAt && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--color-muted)' }}>{lang === 'hi' ? 'मूल्यांकन दिनांक' : 'Evaluated On'}:</span>
                        <strong>{new Date(result.evaluatedAt).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN')}</strong>
                      </div>
                    )}
                  </div>

                  {/* Public Merit List Button */}
                  {result.isPublicMeritListEnabled && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => fetchPublicMerit(result.competitionId || result.competition?.id, result.competitionTitle || result.competition?.title)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                      >
                        <span>🏅</span>
                        <span>{t.viewPublicMerit}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ================= MODAL: PUBLIC MERIT LIST ================= */}
      {publicMeritModal.open && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: '2rem 1rem', overflowY: 'auto' }}
        >
          <div className="card" style={{ background: '#FFFFFF', borderRadius: 'var(--radius-card)', width: '100%', maxWidth: '860px', padding: '1.75rem', boxShadow: 'var(--shadow-card)', marginTop: '1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.2rem 0' }}>
                  🏅 {t.publicMeritList}
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                  {publicMeritModal.competitionTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPublicMeritModal({ open: false, competitionTitle: '', list: [], loading: false, error: null })}
                style={{ background: 'none', border: 'none', fontSize: '1.35rem', cursor: 'pointer', color: 'var(--color-muted)', lineHeight: 1 }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            {publicMeritModal.loading ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <span style={{ fontSize: '1.5rem' }}>⏳</span>
                <p style={{ color: 'var(--color-muted)', marginTop: '0.5rem' }}>{t.connecting}</p>
              </div>
            ) : publicMeritModal.error ? (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                ⚠️ {publicMeritModal.error}
              </div>
            ) : publicMeritModal.list.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-muted)' }}>
                {lang === 'hi' ? 'अभी तक कोई मेरिट सूची उपलब्ध नहीं है।' : 'No merit list entries available yet.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: '#1E40AF', color: '#FFFFFF' }}>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRadius: '6px 0 0 0' }}>{lang === 'hi' ? 'रैंक' : 'Rank'}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>{t.rollNumber}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>{t.candidateName}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>{t.school}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{t.classGrade}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRadius: '0 6px 0 0' }}>{t.finalScore}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicMeritModal.list.map((entry, idx) => (
                      <tr
                        key={entry.rollNumber || idx}
                        style={{
                          background: idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
                          borderBottom: '1px solid var(--color-border)'
                        }}
                      >
                        <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontWeight: 800 }}>
                          {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontFamily: 'monospace', color: '#1E40AF', fontWeight: 700 }}>{entry.rollNumber}</td>
                        <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>{entry.studentName}</td>
                        <td style={{ padding: '0.7rem 1rem', color: 'var(--color-muted)' }}>{entry.school || '—'}</td>
                        <td style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>{entry.classOrGrade || '—'}</td>
                        <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontWeight: 800, color: '#1E40AF' }}>
                          {entry.finalScore} / {entry.maximumMarks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setPublicMeritModal({ open: false, competitionTitle: '', list: [], loading: false, error: null })}
              >
                {lang === 'hi' ? 'बंद करें' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: REGISTER FOR COMPETITION ================= */}
      {registeringComp && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', overflowY: 'auto' }}>
          <div className="card" style={{ background: '#FFFFFF', borderRadius: 'var(--radius-card)', width: '100%', maxWidth: '520px', padding: '1.75rem', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                {t.registerForCompBtn}
              </h3>
              <button
                type="button"
                onClick={() => setRegisteringComp(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                ✕
              </button>
            </div>

            {regModalError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {regModalError}
              </div>
            )}

            <form onSubmit={handleConfirmRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1E40AF', margin: '0 0 0.25rem 0' }}>
                  {registeringComp.title}
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0 }}>
                  {registeringComp.description}
                </p>
              </div>

              {/* Student info confirmation */}
              <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-muted)' }}>{lang === 'hi' ? 'छात्र का नाम' : 'Student'}:</span>
                  <strong>{user?.fullName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-muted)' }}>{t.classLabel}:</span>
                  <strong>{user?.classOrGrade}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-muted)' }}>{t.examDateLabel}:</span>
                  <strong>{registeringComp.examDate ? registeringComp.examDate.split('T')[0] : 'N/A'} ({registeringComp.startTime})</strong>
                </div>
              </div>

              {/* Exam Mode Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {t.selectExamMode} *
                </label>

                {registeringComp.mode === 'BOTH' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: chosenMode === 'ONLINE_MCQ' ? '2px solid #2563EB' : '1px solid var(--color-border)',
                      background: chosenMode === 'ONLINE_MCQ' ? '#EFF6FF' : '#FFFFFF',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="examMode"
                        value="ONLINE_MCQ"
                        checked={chosenMode === 'ONLINE_MCQ'}
                        onChange={(e) => setChosenMode(e.target.value)}
                      />
                      <div>
                        <strong style={{ display: 'block', color: '#1E40AF', fontSize: '0.9rem' }}>📱 {t.modeOnline}</strong>
                        <span style={{ fontSize: '0.775rem', color: 'var(--color-muted)' }}>{lang === 'hi' ? 'मोबाइल, कंप्यूटर या टैबलेट पर ऑनलाइन परीक्षा दें' : 'Take timed exam on your smartphone or computer'}</span>
                      </div>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: chosenMode === 'OMR' ? '2px solid #D97706' : '1px solid var(--color-border)',
                      background: chosenMode === 'OMR' ? '#FFFBEB' : '#FFFFFF',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="examMode"
                        value="OMR"
                        checked={chosenMode === 'OMR'}
                        onChange={(e) => setChosenMode(e.target.value)}
                      />
                      <div>
                        <strong style={{ display: 'block', color: '#B45309', fontSize: '0.9rem' }}>✍️ {t.modeOmr}</strong>
                        <span style={{ fontSize: '0.775rem', color: 'var(--color-muted)' }}>{lang === 'hi' ? 'परीक्षा केंद्र पर मुद्रित ओएमआर शीट में पेन द्वारा परीक्षा दें' : 'Fill paper bubbles at designated physical exam center'}</span>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem', background: '#F1F5F9', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600 }}>
                    {registeringComp.mode === 'ONLINE_MCQ' ? `📱 ${t.modeOnline}` : `✍️ ${t.modeOmr}`}
                  </div>
                )}
              </div>

              {/* Warning Notice: Exam Mode is Permanently Locked */}
              <div style={{ background: '#FFF7ED', border: '1px solid #FFEDD5', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8rem', color: '#C2410C', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span>🔒</span>
                <span>{t.examModeNotice}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setRegisteringComp(null)}
                  disabled={registerSubmitting}
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={registerSubmitting}
                >
                  {registerSubmitting ? '...' : t.registerForCompBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--color-border)', padding: '1rem 0', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-muted)', background: '#FFFFFF' }}>
        {t.footerCopyright}
      </footer>
    </div>
  );
}