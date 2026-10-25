import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export default function ExamRunner({ competitionId, user, onExit, lang, setLang, t }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Local answers state: map from questionId -> { selectedOption, isMarkedForReview }
  const [answersMap, setAnswersMap] = useState({});
  const [savingStatus, setSavingStatus] = useState('saved'); // 'saved' | 'saving' | 'error'

  // Server-authoritative timer
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [isTimeUp, setIsTimeUp] = useState(false);

  // Modals & Final submission state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [autoSubmittedAlert, setAutoSubmittedAlert] = useState(false);

  // Debounce ref for autosave
  const autosaveTimeoutRef = useRef(null);
  const versionMapRef = useRef({});
  const attemptRef = useRef(null);
  attemptRef.current = attempt;

  const getMutationHeaders = () => ({
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  });

  // Format seconds into HH:MM:SS or MM:SS
  const formatTimer = (totalSecs) => {
    if (totalSecs == null || totalSecs < 0) return '00:00';
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // 1. Start or resume attempt on mount
  useEffect(() => {
    let isMounted = true;

    const startOrResume = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/competitions/${competitionId}/attempts`, {
          method: 'POST',
          headers: getMutationHeaders(),
          credentials: 'include'
        });

        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data.success && data.attempt) {
          const att = data.attempt;
          setAttempt(att);

          // Build answers lookup map
          const map = {};
          if (Array.isArray(att.answers)) {
            att.answers.forEach((ans) => {
              map[ans.questionId] = {
                selectedOption: ans.selectedOption || null,
                isMarkedForReview: Boolean(ans.isMarkedForReview),
                clientVersion: ans.clientVersion || 0
              };
              versionMapRef.current[ans.questionId] = ans.clientVersion || 0;
            });
          }
          setAnswersMap(map);

          // Calculate remaining seconds to server endsAt
          const serverEndsAt = new Date(att.endsAt).getTime();
          const now = Date.now();
          const diffSeconds = Math.max(0, Math.floor((serverEndsAt - now) / 1000));
          setRemainingSeconds(diffSeconds);

          // If already submitted
          if (att.status === 'SUBMITTED' || att.status === 'AUTO_SUBMITTED') {
            setSubmissionComplete(true);
            setAutoSubmittedAlert(att.status === 'AUTO_SUBMITTED');
          }
        } else {
          setError(data.error?.message || 'Unable to start examination.');
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Network error connecting to exam server.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    startOrResume();

    return () => {
      isMounted = false;
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [competitionId]);

  // 2. Authoritative Timer Countdown & Auto-submit trigger
  const handleFinalSubmit = useCallback(async (isAutomatic = false) => {
    const curAttempt = attemptRef.current;
    if (!curAttempt || submitting || submissionComplete) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/attempts/${curAttempt.attemptId}/submit`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmissionComplete(true);
        setAutoSubmittedAlert(isAutomatic || data.attempt?.status === 'AUTO_SUBMITTED');
        setShowConfirmModal(false);
      } else {
        console.warn('Submission response:', data);
        setSubmissionComplete(true);
      }
    } catch (err) {
      console.error('Final submission error:', err);
      // Attempt might have auto-submitted on server, mark complete
      setSubmissionComplete(true);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, submissionComplete]);

  useEffect(() => {
    if (remainingSeconds == null || submissionComplete) return;

    if (remainingSeconds <= 0) {
      setIsTimeUp(true);
      handleFinalSubmit(true);
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsTimeUp(true);
          handleFinalSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds, submissionComplete, handleFinalSubmit]);

  // 3. Save Answer to Server
  const saveAnswerToServer = async (questionId, selectedOption, isMarkedForReview, clientVersion, clientTimestamp) => {
    if (!attempt || submissionComplete) return;

    setSavingStatus('saving');
    try {
      const res = await fetch(`${API_BASE_URL}/attempts/${attempt.attemptId}/answers`, {
        method: 'PATCH',
        headers: getMutationHeaders(),
        body: JSON.stringify({
          questionId,
          selectedOption,
          isMarkedForReview,
          clientVersion,
          clientTimestamp
        }),
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSavingStatus('saved');
      } else {
        setSavingStatus('error');
      }
    } catch (err) {
      console.warn('Autosave network error:', err);
      setSavingStatus('error');
    }
  };

  // Option selection handler with real-time autosave
  const handleSelectOption = (questionId, optionLetter) => {
    if (submissionComplete || isTimeUp) return;

    const nextVer = (versionMapRef.current[questionId] || 0) + 1;
    versionMapRef.current[questionId] = nextVer;
    const clientTimestamp = new Date().toISOString();

    const currentEntry = answersMap[questionId] || { selectedOption: null, isMarkedForReview: false };
    const newEntry = {
      ...currentEntry,
      selectedOption: optionLetter,
      clientVersion: nextVer,
      clientTimestamp
    };

    setAnswersMap((prev) => ({
      ...prev,
      [questionId]: newEntry
    }));

    // Trigger immediate debounced autosave
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = setTimeout(() => {
      saveAnswerToServer(questionId, newEntry.selectedOption, newEntry.isMarkedForReview, nextVer, clientTimestamp);
    }, 300);
  };

  // Clear current response handler
  const handleClearResponse = (questionId) => {
    if (submissionComplete || isTimeUp) return;

    const nextVer = (versionMapRef.current[questionId] || 0) + 1;
    versionMapRef.current[questionId] = nextVer;
    const clientTimestamp = new Date().toISOString();

    const currentEntry = answersMap[questionId] || { selectedOption: null, isMarkedForReview: false };
    const newEntry = {
      ...currentEntry,
      selectedOption: null,
      clientVersion: nextVer,
      clientTimestamp
    };

    setAnswersMap((prev) => ({
      ...prev,
      [questionId]: newEntry
    }));

    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = setTimeout(() => {
      saveAnswerToServer(questionId, null, newEntry.isMarkedForReview, nextVer, clientTimestamp);
    }, 200);
  };

  // Toggle Mark for Review
  const handleToggleReview = (questionId) => {
    if (submissionComplete || isTimeUp) return;

    const nextVer = (versionMapRef.current[questionId] || 0) + 1;
    versionMapRef.current[questionId] = nextVer;
    const clientTimestamp = new Date().toISOString();

    const currentEntry = answersMap[questionId] || { selectedOption: null, isMarkedForReview: false };
    const newEntry = {
      ...currentEntry,
      isMarkedForReview: !currentEntry.isMarkedForReview,
      clientVersion: nextVer,
      clientTimestamp
    };

    setAnswersMap((prev) => ({
      ...prev,
      [questionId]: newEntry
    }));

    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = setTimeout(() => {
      saveAnswerToServer(questionId, newEntry.selectedOption, newEntry.isMarkedForReview, nextVer, clientTimestamp);
    }, 200);
  };

  // ================= RENDER: LOADING STATE =================
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-page)',
        padding: '2rem'
      }}>
        <div style={{
          background: '#FFFFFF',
          padding: '2.5rem 3rem',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)',
          textAlign: 'center',
          maxWidth: '450px'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>⏳</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>{t.examLoading}</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', margin: 0 }}>
            {lang === 'hi' ? 'परीक्षा सर्वर से जुड़ रहे हैं...' : 'Connecting to secure examination server...'}
          </p>
        </div>
      </div>
    );
  }

  // ================= RENDER: ERROR STATE =================
  if (error) {
    const isOmrNotice = error.includes('OMR') || error.includes('paper OMR');

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-page)',
        padding: '2rem'
      }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-border)',
          padding: '2.5rem',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)',
          maxWidth: '540px',
          width: '100%',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {isOmrNotice ? '✍️' : '⚠️'}
          </div>

          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: isOmrNotice ? '#B45309' : '#DC2626', marginBottom: '1rem' }}>
            {isOmrNotice ? t.omrStudentNoticeTitle : t.systemTitle}
          </h2>

          <p style={{ color: '#334155', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
            {isOmrNotice ? t.omrStudentNoticeDesc : error}
          </p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onExit}
            style={{ padding: '0.75rem 2rem', fontWeight: 700 }}
          >
            ← {t.returnToDashboardBtn}
          </button>
        </div>
      </div>
    );
  }

  // ================= RENDER: FINAL SUBMITTED STATE =================
  if (submissionComplete) {
    const questionsList = attempt?.questionSnapshot || [];
    const answeredCount = Object.values(answersMap).filter((a) => a.selectedOption != null).length;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-page)',
        padding: '2rem'
      }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-border)',
          padding: '3rem 2.5rem',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)',
          maxWidth: '560px',
          width: '100%',
          textAlign: 'center'
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: '#DCFCE7',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            margin: '0 auto 1.5rem auto'
          }}>
            ✓
          </div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#166534', marginBottom: '0.5rem' }}>
            {t.examSubmittedSuccessTitle}
          </h2>

          {autoSubmittedAlert && (
            <div style={{
              background: '#FEF3C7',
              border: '1px solid #FDE68A',
              color: '#92400E',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              fontWeight: 600
            }}>
              ⏰ {t.autoSubmitNotice}
            </div>
          )}

          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {t.examSubmittedSuccessDesc}
          </p>

          <div style={{
            background: '#F8FAFC',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '1.25rem',
            marginBottom: '1.75rem',
            display: 'flex',
            justifyContent: 'space-around',
            textAlign: 'center'
          }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                {t.totalQuestionsCount}
              </span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1E293B' }}>
                {questionsList.length}
              </span>
            </div>
            <div style={{ borderLeft: '1px solid var(--color-border)', height: '40px' }} />
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                {t.paletteAnswered}
              </span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16A34A' }}>
                {answeredCount}
              </span>
            </div>
          </div>

          <p style={{ fontSize: '0.825rem', color: '#64748B', lineHeight: 1.5, marginBottom: '2rem' }}>
            {t.examSubmittedNotice}
          </p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onExit}
            style={{ width: '100%', padding: '0.85rem', fontWeight: 700, fontSize: '1rem' }}
          >
            ← {t.returnToDashboardBtn}
          </button>
        </div>
      </div>
    );
  }

  // ================= MAIN EXAM RUNNER VIEW =================
  const questionsList = attempt?.questionSnapshot || [];
  const currentQ = questionsList[currentIndex] || null;
  const currentAnswer = currentQ ? answersMap[currentQ.questionId] || { selectedOption: null, isMarkedForReview: false } : null;

  // Stats for palette
  const answeredCount = Object.values(answersMap).filter((a) => a.selectedOption != null).length;
  const reviewCount = Object.values(answersMap).filter((a) => a.isMarkedForReview).length;

  const isTimerCritical = remainingSeconds != null && remainingSeconds < 300; // less than 5 minutes

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-page)' }}>
      {/* EXAM RUNNER HEADER */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: '#FFFFFF',
        borderBottom: '2px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          maxWidth: '1440px',
          margin: '0 auto',
          width: '100%',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          {/* Exam & Student Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📝</span>
            <div>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, display: 'block', lineHeight: 1.2 }}>
                {attempt?.competition?.title || 'Online Examination'}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                {user?.fullName} &bull; {lang === 'hi' ? 'रोल नं.' : 'Roll'}: <strong>{user?.mobileNormalized?.slice(-4) || 'STUDENT'}</strong>
              </span>
            </div>
          </div>

          {/* Autosave Status Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
            {savingStatus === 'saving' && (
              <span style={{ color: '#D97706', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                {t.autosaveStatusSaving}
              </span>
            )}
            {savingStatus === 'saved' && (
              <span style={{ color: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                {t.autosaveStatusSaved}
              </span>
            )}
            {savingStatus === 'error' && (
              <span style={{ color: '#DC2626', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                {t.autosaveStatusError}
              </span>
            )}
          </div>

          {/* Authoritative Timer Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div style={{
              background: isTimerCritical ? '#FEE2E2' : '#EFF6FF',
              border: `1px solid ${isTimerCritical ? '#FCA5A5' : '#BFDBFE'}`,
              color: isTimerCritical ? '#B91C1C' : '#1E40AF',
              padding: '0.4rem 1rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 800,
              fontSize: '1.1rem',
              letterSpacing: '0.05em'
            }}>
              <span>⏱️</span>
              <span>{formatTimer(remainingSeconds)}</span>
            </div>

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
          </div>
        </div>
      </header>

      {/* EXAM MAIN CONTENT (TWO COLUMN ON DESKTOP) */}
      <main style={{
        flex: 1,
        maxWidth: '1440px',
        margin: '0 auto',
        width: '100%',
        padding: '1.25rem',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 340px',
        gap: '1.25rem',
        alignItems: 'start'
      }}>
        {/* LEFT COLUMN: ACTIVE QUESTION CARD */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '620px'
        }}>
          {/* Question Header Bar */}
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
            borderTopLeftRadius: 'var(--radius-card)',
            borderTopRightRadius: 'var(--radius-card)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{
                background: '#1E40AF',
                color: '#FFFFFF',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.9rem'
              }}>
                {t.questionNumberPrefix} {currentIndex + 1} / {questionsList.length}
              </span>
              {currentQ?.subject && (
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                  ({currentQ.subject})
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
              <span style={{ background: '#DCFCE7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                +{currentQ?.marks || 1} {lang === 'hi' ? 'अंक' : 'Mark'}
              </span>
              {currentQ?.negativeMarks > 0 && (
                <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                  -{currentQ.negativeMarks} {lang === 'hi' ? 'ऋणात्मक' : 'Neg'}
                </span>
              )}
            </div>
          </div>

          {/* Question Body */}
          <div style={{ padding: '1.75rem 1.5rem', flex: 1 }}>
            {currentQ ? (
              <div>
                <p style={{
                  fontSize: '1.15rem',
                  fontWeight: 600,
                  lineHeight: 1.6,
                  color: '#1E293B',
                  marginBottom: '2rem',
                  whiteSpace: 'pre-line'
                }}>
                  {currentQ.prompt}
                </p>

                {/* Options List (A, B, C, D) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {['A', 'B', 'C', 'D'].map((letter) => {
                    const optText = currentQ.options ? currentQ.options[letter] : '';
                    const isSelected = currentAnswer?.selectedOption === letter;

                    return (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => handleSelectOption(currentQ.questionId, letter)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '1rem 1.25rem',
                          borderRadius: '10px',
                          border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                          background: isSelected ? '#EFF6FF' : '#FFFFFF',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                          fontSize: '1rem',
                          color: '#1E293B',
                          boxShadow: isSelected ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none'
                        }}
                      >
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          flexShrink: 0,
                          background: isSelected ? '#2563EB' : '#F1F5F9',
                          color: isSelected ? '#FFFFFF' : '#475569',
                          border: isSelected ? 'none' : '1px solid #CBD5E1'
                        }}>
                          {letter}
                        </div>
                        <span style={{ flex: 1, fontWeight: isSelected ? 600 : 400, lineHeight: 1.4 }}>
                          {optText}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--color-muted)' }}>{t.noQuestionsFound}</p>
            )}
          </div>

          {/* Question Footer Action Bar */}
          <div style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            borderBottomLeftRadius: 'var(--radius-card)',
            borderBottomRightRadius: 'var(--radius-card)'
          }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Clear Response Button */}
              {currentAnswer?.selectedOption != null && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => currentQ && handleClearResponse(currentQ.questionId)}
                  style={{ borderColor: '#CBD5E1', color: '#64748B' }}
                >
                  ✕ {t.clearResponseBtn}
                </button>
              )}

              {/* Mark for Review Toggle */}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => currentQ && handleToggleReview(currentQ.questionId)}
                style={{
                  borderColor: currentAnswer?.isMarkedForReview ? '#7C3AED' : '#CBD5E1',
                  color: currentAnswer?.isMarkedForReview ? '#7C3AED' : '#475569',
                  background: currentAnswer?.isMarkedForReview ? '#F5F3FF' : 'transparent',
                  fontWeight: currentAnswer?.isMarkedForReview ? 700 : 500
                }}
              >
                ★ {currentAnswer?.isMarkedForReview ? t.unmarkReviewBtn : t.markForReviewBtn}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                style={{ minWidth: '95px' }}
              >
                {t.prevQuestionBtn}
              </button>

              {currentIndex < questionsList.length - 1 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setCurrentIndex((prev) => Math.min(questionsList.length - 1, prev + 1))}
                  style={{ minWidth: '95px' }}
                >
                  {t.nextQuestionBtn}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowConfirmModal(true)}
                  style={{
                    background: '#16A34A',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    minWidth: '120px'
                  }}
                >
                  ✓ {t.submitExamBtn}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: QUESTION PALETTE & SUMMARY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Question Palette Card */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{t.questionPaletteTitle}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                {answeredCount} / {questionsList.length}
              </span>
            </h3>

            {/* Palette Legend */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.4rem',
              fontSize: '0.75rem',
              marginBottom: '1rem',
              padding: '0.5rem',
              background: '#F8FAFC',
              borderRadius: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#16A34A' }} />
                <span>{t.paletteAnswered}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#E2E8F0', border: '1px solid #CBD5E1' }} />
                <span>{t.paletteNotAnswered}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#7C3AED' }} />
                <span>{t.paletteMarkedReview}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', border: '2px solid #2563EB', background: '#EFF6FF' }} />
                <span>{t.paletteCurrent}</span>
              </div>
            </div>

            {/* Questions Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '0.5rem',
              maxHeight: '280px',
              overflowY: 'auto',
              padding: '0.25rem 0'
            }}>
              {questionsList.map((q, idx) => {
                const ans = answersMap[q.questionId];
                const isAns = ans && ans.selectedOption != null;
                const isRev = ans && ans.isMarkedForReview;
                const isCurrent = idx === currentIndex;

                let bg = '#F1F5F9';
                let color = '#475569';
                let border = '1px solid #CBD5E1';

                if (isRev) {
                  bg = '#7C3AED';
                  color = '#FFFFFF';
                  border = '1px solid #6D28D9';
                } else if (isAns) {
                  bg = '#16A34A';
                  color = '#FFFFFF';
                  border = '1px solid #15803D';
                }

                if (isCurrent) {
                  border = '2.5px solid #2563EB';
                }

                return (
                  <button
                    key={q.questionId}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    style={{
                      aspectRatio: '1',
                      borderRadius: '8px',
                      background: bg,
                      color: color,
                      border: border,
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isCurrent ? '0 0 0 2px rgba(37,99,235,0.3)' : 'none',
                      transition: 'all 0.1s ease'
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Submit Exam Button */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowConfirmModal(true)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontWeight: 700,
                  background: '#16A34A',
                  borderColor: '#16A34A'
                }}
              >
                ✓ {t.submitExamBtn}
              </button>
            </div>
          </div>

          {/* Quick Exam Instructions Card */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
            fontSize: '0.8rem',
            color: '#475569',
            lineHeight: 1.5
          }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1E293B', marginBottom: '0.5rem' }}>
              📌 {t.instructionsTitle}
            </h4>
            <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
              <li>{t.instructionsPoint1}</li>
              <li style={{ marginTop: '0.35rem' }}>{t.instructionsPoint2}</li>
              <li style={{ marginTop: '0.35rem' }}>{t.instructionsPoint3}</li>
              <li style={{ marginTop: '0.35rem' }}>{t.instructionsPoint4}</li>
            </ul>
          </div>
        </div>
      </main>

      {/* CONFIRMATION SUBMISSION MODAL */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 60,
          padding: '1rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 'var(--radius-card)',
            maxWidth: '480px',
            width: '100%',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: '#1E293B' }}>
              {t.confirmSubmitTitle}
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#64748B', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              {t.confirmSubmitDesc}
            </p>

            <div style={{
              background: '#F8FAFC',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              fontSize: '0.9rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#475569' }}>{t.submitSummaryTotal}</span>
                <span style={{ fontWeight: 700 }}>{questionsList.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#16A34A' }}>{t.submitSummaryAnswered}</span>
                <span style={{ fontWeight: 700, color: '#16A34A' }}>{answeredCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#7C3AED' }}>{t.submitSummaryReview}</span>
                <span style={{ fontWeight: 700, color: '#7C3AED' }}>{reviewCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#DC2626' }}>{lang === 'hi' ? 'उत्तर नहीं दिए:' : 'Unanswered:'}</span>
                <span style={{ fontWeight: 700, color: '#DC2626' }}>
                  {questionsList.length - answeredCount}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={submitting}
              >
                {t.cancelSubmitBtn}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => handleFinalSubmit(false)}
                disabled={submitting}
                style={{
                  background: '#16A34A',
                  color: '#FFFFFF',
                  fontWeight: 700
                }}
              >
                {submitting ? (lang === 'hi' ? 'जमा हो रहा है...' : 'Submitting...') : t.confirmSubmitBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
