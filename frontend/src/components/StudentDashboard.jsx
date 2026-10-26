import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export default function StudentDashboard({ user, onLogout, lang, setLang, t, onStartExam }) {
  const [loggingOut, setLoggingOut] = useState(false);

  const isPreview = typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('preview') || new URLSearchParams(window.location.search).get('view'));

  const demoComp = {
    id: 'demo-comp-01',
    title: 'वार्षिक विज्ञान एवं गणित प्रतिभा खोज परीक्षा 2026',
    titleEn: 'Annual Science & Mathematics Talent Search 2026',
    description: 'राज्य स्तरीय आंचलिक प्रतिभा खोज प्रतियोगिता - भौतिक विज्ञान, रसायन विज्ञान व गणित का वस्तुनिष्ठ पारदर्शी मूल्यांकन।',
    category: 'State Academic Talent',
    examDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    startTime: '10:00 AM',
    endTime: '11:30 AM',
    durationMinutes: 90,
    mode: 'BOTH',
    totalMarks: 100,
    eligibleClasses: ['Class 9th', 'Class 10th', 'Class 11th']
  };

  const demoReg = {
    id: 'demo-reg-01',
    rollNumber: '2026-1048',
    examMode: 'OMR',
    omrSheetToken: 'OMR-2026-1048-HMAC-VERIFIED',
    competition: demoComp
  };

  const demoResult = {
    id: 'demo-result-01',
    competitionId: 'past-comp-01',
    competitionTitle: 'प्राथमिक स्तर प्रतिभा खोज प्रतियोगिता 2025',
    rollNumber: '2025-0812',
    studentName: user?.fullName || 'Aarav Sharma',
    rank: 1,
    finalScore: 94,
    maximumMarks: 100,
    correctAnswers: 24,
    incorrectAnswers: 1,
    unansweredQuestions: 0,
    positiveMarks: 96,
    negativeDeduction: 2,
    isPublicMeritListEnabled: true
  };

  // Core Data States
  const [competitions, setCompetitions] = useState(() => isPreview ? [demoComp] : []);
  const [registrations, setRegistrations] = useState(() => isPreview ? [demoReg] : []);
  const [myResults, setMyResults] = useState(() => isPreview ? [demoResult] : []);
  const [loading, setLoading] = useState(() => !isPreview);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successAlert, setSuccessAlert] = useState(null);

  // Active Navigation Tab: 'explore' | 'my-exams' | 'ranks'
  const [activeTab, setActiveTab] = useState('my-exams');

  // Modals State
  const [registeringComp, setRegisteringComp] = useState(null);
  const [chosenMode, setChosenMode] = useState('ONLINE_MCQ');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [regModalError, setRegModalError] = useState(null);

  const [publicMeritModal, setPublicMeritModal] = useState({ open: false, competitionTitle: '', list: [], loading: false, error: null });
  const [hallTicketModal, setHallTicketModal] = useState({ open: false, registration: null });
  const [scorecardModal, setScorecardModal] = useState({ open: false, result: null });
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // Live Countdown State for Primary Upcoming Exam
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, isLive: false, hasUpcoming: false });

  const getMutationHeaders = () => ({
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  });

  // Load Competitions, Registrations and Results
  const loadData = async () => {
    if (!isPreview) setLoading(true);
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

      const isPreview = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('preview') || new URLSearchParams(window.location.search).get('view'));

      if (compsRes.ok && compsData.success && compsData.competitions?.length > 0) {
        setCompetitions(compsData.competitions || []);
      } else if (isPreview) {
        const futureDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
        setCompetitions([
          {
            id: 'demo-comp-01',
            title: 'वार्षिक विज्ञान एवं गणित प्रतिभा खोज परीक्षा 2026',
            titleEn: 'Annual Science & Mathematics Talent Search 2026',
            description: 'राज्य स्तरीय आंचलिक प्रतिभा खोज प्रतियोगिता - भौतिक विज्ञान, रसायन विज्ञान व गणित का वस्तुनिष्ठ मूल्यांकन।',
            category: 'State Academic Talent',
            examDate: futureDate,
            startTime: '10:00 AM',
            endTime: '11:30 AM',
            durationMinutes: 90,
            mode: 'BOTH',
            totalMarks: 100,
            eligibleClasses: ['Class 9th', 'Class 10th', 'Class 11th']
          },
          {
            id: 'demo-comp-02',
            title: 'सामान्य ज्ञान एवं समसामयिकी छात्रवृत्ति परीक्षा',
            titleEn: 'General Studies & Regional Merit Scholarship',
            description: 'क्षेत्रीय प्रतिभा विकास हेतु विशेष छात्रवृत्ति एवं प्रशस्ति पत्र योजना।',
            category: 'Scholarship / Merit',
            examDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
            startTime: '02:00 PM',
            endTime: '03:30 PM',
            durationMinutes: 90,
            mode: 'ONLINE_MCQ',
            totalMarks: 80,
            eligibleClasses: ['Class 10th', 'Class 12th']
          }
        ]);
      }

      if (regsRes.ok && regsData.success && regsData.registrations?.length > 0) {
        setRegistrations(regsData.registrations || []);
      } else if (isPreview) {
        const futureDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
        setRegistrations([
          {
            id: 'demo-reg-01',
            rollNumber: '2026-1048',
            examMode: 'OMR',
            omrSheetToken: 'OMR-2026-1048-HMAC-VERIFIED',
            competition: {
              id: 'demo-comp-01',
              title: 'वार्षिक विज्ञान एवं गणित प्रतिभा खोज परीक्षा 2026',
              category: 'State Academic Talent',
              examDate: futureDate,
              startTime: '10:00 AM',
              endTime: '11:30 AM',
              durationMinutes: 90,
              totalMarks: 100,
              mode: 'BOTH'
            }
          }
        ]);
      }

      if (resultsRes.ok && resultsData.success && resultsData.results?.length > 0) {
        setMyResults(resultsData.results || []);
      } else if (isPreview) {
        setMyResults([
          {
            id: 'demo-result-01',
            competitionId: 'past-comp-01',
            competitionTitle: 'प्राथमिक स्तर प्रतिभा खोज प्रतियोगिता 2025',
            rollNumber: '2025-0812',
            studentName: user?.fullName || 'Aarav Sharma',
            rank: 1,
            finalScore: 92,
            maximumMarks: 100,
            correctAnswers: 23,
            incorrectAnswers: 1,
            unansweredQuestions: 1,
            positiveMarks: 92,
            negativeDeduction: 0,
            isPublicMeritListEnabled: true
          }
        ]);
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

  // Eligibility check: student's class matches one of competition's eligibleClasses
  const checkEligibility = (comp) => {
    if (!comp.eligibleClasses || !user?.classOrGrade) return false;
    const studentClass = user.classOrGrade.trim().toLowerCase();
    const allowed = Array.isArray(comp.eligibleClasses) ? comp.eligibleClasses : [comp.eligibleClasses];
    return allowed.some((c) => c.trim().toLowerCase() === studentClass);
  };

  // Timeline check for registration
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

  const getRegistrationForComp = (compId) => {
    return registrations.find((r) => {
      const cId = r.competition?.id || r.competition?._id || r.competitionId;
      return cId === compId;
    });
  };

  const openRegisterModal = (comp) => {
    setRegisteringComp(comp);
    if (comp.mode === 'OMR') {
      setChosenMode('OMR');
    } else {
      setChosenMode('ONLINE_MCQ');
    }
    setRegModalError(null);
  };

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

  // -------------------------------------------------------------
  // Primary Upcoming Exam & Countdown Calculation
  // -------------------------------------------------------------
  // Find primary upcoming exam: prioritize registered future competition, else any future competition
  const primaryUpcoming = React.useMemo(() => {
    const now = new Date();
    // 1. Registered competitions in future
    const upcomingRegs = registrations
      .filter((r) => r.competition?.examDate && new Date(r.competition.examDate) >= new Date(now.getTime() - 24 * 60 * 60 * 1000))
      .sort((a, b) => new Date(a.competition.examDate) - new Date(b.competition.examDate));

    if (upcomingRegs.length > 0) {
      return {
        comp: upcomingRegs[0].competition,
        registration: upcomingRegs[0],
        isRegistered: true
      };
    }

    // 2. Future published competitions
    const upcomingComps = competitions
      .filter((c) => c.examDate && new Date(c.examDate) >= new Date(now.getTime() - 24 * 60 * 60 * 1000))
      .sort((a, b) => new Date(a.examDate) - new Date(b.examDate));

    if (upcomingComps.length > 0) {
      const reg = getRegistrationForComp(upcomingComps[0].id);
      return {
        comp: upcomingComps[0],
        registration: reg,
        isRegistered: !!reg
      };
    }

    // 3. Fallback to latest registration or competition
    if (registrations.length > 0) {
      return {
        comp: registrations[0].competition,
        registration: registrations[0],
        isRegistered: true
      };
    }

    if (competitions.length > 0) {
      return {
        comp: competitions[0],
        registration: null,
        isRegistered: false
      };
    }

    return null;
  }, [competitions, registrations]);

  // Live Timer Effect
  useEffect(() => {
    if (!primaryUpcoming || !primaryUpcoming.comp?.examDate) {
      setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, isLive: false, hasUpcoming: false });
      return;
    }

    const comp = primaryUpcoming.comp;
    const updateCountdown = () => {
      let target = new Date(comp.examDate);
      if (comp.startTime) {
        const parts = comp.startTime.split(':');
        if (parts.length >= 2) {
          target.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
        }
      }

      const now = new Date();
      const diff = target.getTime() - now.getTime();

      if (diff <= 0) {
        // If within exam duration (e.g. durationMinutes), it is currently live
        const durationMs = (comp.durationMinutes || 60) * 60 * 1000;
        const isLive = diff >= -durationMs;
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, isLive, hasUpcoming: true });
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setCountdown({ days, hours, minutes, seconds, isLive: false, hasUpcoming: true });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [primaryUpcoming]);

  // -------------------------------------------------------------
  // Performance Metrics Calculation (Real Data)
  // -------------------------------------------------------------
  const metrics = React.useMemo(() => {
    const totalExams = registrations.length || myResults.length;

    let totalCorrect = 0;
    let totalQuestionsAnswered = 0;
    let totalScore = 0;
    let totalMax = 0;

    myResults.forEach((r) => {
      if (typeof r.correctAnswers === 'number') {
        totalCorrect += r.correctAnswers;
        totalQuestionsAnswered += (r.correctAnswers + (r.incorrectAnswers || 0));
      }
      if (typeof r.finalScore === 'number' && typeof r.maximumMarks === 'number' && r.maximumMarks > 0) {
        totalScore += r.finalScore;
        totalMax += r.maximumMarks;
      }
    });

    let accuracy = '—';
    if (totalQuestionsAnswered > 0) {
      accuracy = `${Math.round((totalCorrect / totalQuestionsAnswered) * 100)}%`;
    } else if (totalMax > 0) {
      accuracy = `${Math.round((totalScore / totalMax) * 100)}%`;
    }

    const meritsCount = myResults.filter((r) => typeof r.rank === 'number' && r.rank <= 3).length;
    const bestRank = myResults.reduce((min, r) => (r.rank && r.rank < min ? r.rank : min), null);

    return { totalExams, accuracy, meritsCount, bestRank };
  }, [registrations, myResults]);

  // Student Roll Number display (earliest registration or active)
  const studentRollNumber = registrations.length > 0 ? registrations[0].rollNumber : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F5F6FA', color: '#111827', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* ================= 1. TOP NAVIGATION BAR ================= */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{
          maxWidth: '1240px',
          margin: '0 auto',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          {/* Logo & Project Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0645E5 0%, #101B35 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              boxShadow: '0 4px 10px rgba(6, 69, 229, 0.25)'
            }}>
              🎓
            </div>
            <div>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#101B35', display: 'block', lineHeight: 1.2 }}>
                {t.systemTitle}
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>
                {lang === 'hi' ? 'छात्र प्रतियोगिता पोर्टल' : 'Student Examination Portal'}
              </span>
            </div>
          </div>

          {/* Right Action Controls: Lang Toggle, Notifications, Profile & Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            {/* Language Switcher */}
            <div style={{
              display: 'inline-flex',
              background: '#F0F2F6',
              padding: '3px',
              borderRadius: '9999px',
              border: '1px solid #E2E8F0'
            }}>
              <button
                type="button"
                onClick={() => setLang('hi')}
                style={{
                  border: 'none',
                  background: lang === 'hi' ? '#0645E5' : 'transparent',
                  color: lang === 'hi' ? '#FFFFFF' : '#64748B',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                हिंदी
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                style={{
                  border: 'none',
                  background: lang === 'en' ? '#0645E5' : 'transparent',
                  color: lang === 'en' ? '#FFFFFF' : '#64748B',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                English
              </button>
            </div>

            {/* Notification Bell with alert dot */}
            <button
              type="button"
              onClick={() => setHelpModalOpen(true)}
              aria-label="Notifications"
              style={{
                position: 'relative',
                background: '#F0F2F6',
                border: '1px solid #E2E8F0',
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#101B35',
                fontSize: '1rem'
              }}
            >
              🔔
              <span style={{
                position: 'absolute',
                top: '5px',
                right: '5px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#10B981',
                border: '1.5px solid #FFFFFF'
              }} />
            </button>

            {/* Student Profile Pill / Logout */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: '#F0F2F6',
              padding: '0.3rem 0.6rem 0.3rem 0.3rem',
              borderRadius: '9999px',
              border: '1px solid #E2E8F0'
            }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: '#0645E5',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'S'}
              </div>
              <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#101B35', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.fullName?.split(' ')[0] || 'Student'}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                title={t.btnLogout}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#EF4444',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '0.2rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                🚪
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main style={{ maxWidth: '1240px', width: '100%', margin: '0 auto', padding: '1.5rem 1.25rem 5rem 1.25rem', flex: 1 }}>

        {/* Registration Success Banner */}
        {successAlert && (
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
            color: '#FFFFFF',
            borderRadius: '16px',
            padding: '1.25rem 1.75rem',
            marginBottom: '1.5rem',
            boxShadow: '0 8px 25px rgba(16, 185, 129, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <span style={{ fontSize: '2rem' }}>🎉</span>
              <div>
                <strong style={{ fontSize: '1.1rem', display: 'block' }}>{t.registrationSuccess}</strong>
                <p style={{ margin: '0.2rem 0 0 0', opacity: 0.95, fontSize: '0.875rem' }}>
                  {successAlert.compTitle} &bull; {lang === 'hi' ? 'माध्यम' : 'Mode'}: <strong>{successAlert.mode === 'OMR' ? '✍️ Paper OMR' : '📱 Online MCQ'}</strong>
                </p>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: '10px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.rollNumberLabel}</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.08em' }}>{successAlert.rollNumber}</span>
            </div>
          </div>
        )}

        {/* ================= 2. STUDENT WELCOME BANNER ================= */}
        <section style={{
          background: 'linear-gradient(135deg, #101B35 0%, #0D162C 60%, #0645E5 120%)',
          borderRadius: '24px',
          padding: '2rem',
          color: '#FFFFFF',
          marginBottom: '2rem',
          boxShadow: '0 12px 35px rgba(16, 27, 53, 0.15)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Subtle Decorative Pattern Background */}
          <div style={{
            position: 'absolute',
            right: '-40px',
            bottom: '-40px',
            width: '260px',
            height: '260px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,69,229,0.3) 0%, rgba(16,27,53,0) 70%)',
            pointerEvents: 'none'
          }} />

          {/* Top Banner Row: Profile & Info */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.5rem',
            marginBottom: '1.75rem',
            position: 'relative',
            zIndex: 1
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              {/* Avatar */}
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #0645E5 0%, #3B82F6 100%)',
                border: '3px solid rgba(255, 255, 255, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.85rem',
                color: '#FFFFFF',
                boxShadow: '0 8px 20px rgba(6, 69, 229, 0.35)'
              }}>
                👨‍🎓
              </div>

              {/* Greeting & Metadata */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                    {t.greetingNamaste}, {user?.fullName}!
                  </h1>
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.18)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#6EE7B7',
                    padding: '0.2rem 0.65rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                    {lang === 'hi' ? 'सक्रिय परीक्षार्थी' : 'Active Candidate'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', opacity: 0.9, fontSize: '0.875rem', flexWrap: 'wrap' }}>
                  {studentRollNumber && (
                    <span style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 700, letterSpacing: '0.04em' }}>
                      🆔 {t.rollNumberLabel}: {studentRollNumber}
                    </span>
                  )}
                  <span>🏫 {user?.school || 'Education Committee Academy'}</span>
                  <span style={{ background: 'rgba(6, 69, 229, 0.4)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 700 }}>
                    🏷️ {user?.classOrGrade || 'Grade 10'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Status Pill */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '0.75rem 1.25rem',
              backdropFilter: 'blur(8px)',
              textAlign: 'right'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.accountStatus}
              </span>
              <strong style={{ fontSize: '0.95rem', color: '#34D399', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.15rem' }}>
                ● {t.statusActive}
              </strong>
            </div>
          </div>

          {/* Three Performance Stat Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            position: 'relative',
            zIndex: 1
          }}>
            {/* Total Exams */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.07)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              padding: '1.1rem 1.25rem',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'rgba(6, 69, 229, 0.25)',
                border: '1px solid rgba(6, 69, 229, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem'
              }}>
                📝
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t.totalExams}
                </span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFFFFF' }}>
                  {metrics.totalExams}
                </span>
              </div>
            </div>

            {/* Accuracy */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.07)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              padding: '1.1rem 1.25rem',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem'
              }}>
                🎯
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t.accuracy}
                </span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34D399' }}>
                  {metrics.accuracy}
                </span>
              </div>
            </div>

            {/* Merits & Ranks */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.07)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              padding: '1.1rem 1.25rem',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem'
              }}>
                🏆
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t.merits}
                </span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FBBF24' }}>
                  {metrics.bestRank ? `#${metrics.bestRank}` : `${metrics.meritsCount} ${lang === 'hi' ? 'मेरिट' : 'Awards'}`}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 3. UPCOMING EXAM SECTION ================= */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: '4px', height: '22px', background: '#0645E5', borderRadius: '2px' }} />
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                {t.upcomingExamTitle}
              </h2>
            </div>

            {countdown.hasUpcoming && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: countdown.isLive ? '#DCFCE7' : '#EFF6FF',
                color: countdown.isLive ? '#15803D' : '#0645E5',
                border: `1px solid ${countdown.isLive ? '#86EFAC' : '#BFDBFE'}`,
                padding: '0.3rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 700
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: countdown.isLive ? '#16A34A' : '#0645E5',
                  animation: countdown.isLive ? 'pulse 1.5s infinite' : 'none'
                }} />
                {countdown.isLive ? t.liveExamBadge : t.startingSoonBadge}
              </span>
            )}
          </div>

          {primaryUpcoming ? (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '20px',
              padding: '1.75rem',
              boxShadow: '0 8px 30px rgba(16, 27, 53, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem'
            }}>
              {/* Competition Header & Mode Tag */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                      {primaryUpcoming.comp.title}
                    </h3>
                    <span style={{
                      background: primaryUpcoming.registration?.examMode === 'OMR' ? '#FEF3C7' : '#EFF6FF',
                      color: primaryUpcoming.registration?.examMode === 'OMR' ? '#B45309' : '#0645E5',
                      border: `1px solid ${primaryUpcoming.registration?.examMode === 'OMR' ? '#FDE68A' : '#BFDBFE'}`,
                      padding: '0.25rem 0.65rem',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 700
                    }}>
                      {primaryUpcoming.registration?.examMode === 'OMR' ? '✍️ Paper OMR Sheet' : '📱 Online MCQ Exam'}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#64748B', fontSize: '0.9rem', maxWidth: '750px', lineHeight: 1.5 }}>
                    {primaryUpcoming.comp.description}
                  </p>
                </div>

                {/* Registration Confirmation Badge */}
                <div>
                  {primaryUpcoming.isRegistered ? (
                    <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', padding: '0.45rem 0.85rem', borderRadius: '10px', textAlign: 'right' }}>
                      <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                        {t.statusConfirmed}
                      </span>
                      <strong style={{ fontSize: '0.95rem', color: '#15803D' }}>
                        Roll #{primaryUpcoming.registration.rollNumber}
                      </strong>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openRegisterModal(primaryUpcoming.comp)}
                      style={{
                        background: '#0645E5',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '0.55rem 1.25rem',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(6,69,229,0.25)'
                      }}
                    >
                      📝 {t.registerForCompBtn}
                    </button>
                  )}
                </div>
              </div>

              {/* Middle Row: Countdown Timer & Exam Specs */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1.25rem',
                background: '#F0F2F6',
                padding: '1.25rem',
                borderRadius: '16px'
              }}>
                {/* Live Countdown Display */}
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.65rem' }}>
                    ⏳ {lang === 'hi' ? 'परीक्षा समय उलटी गिनती' : 'Exam Countdown Timer'}
                  </span>
                  
                  {countdown.isLive ? (
                    <div style={{ background: '#10B981', color: '#FFFFFF', padding: '1rem', borderRadius: '12px', textAlign: 'center', fontWeight: 800, fontSize: '1.1rem' }}>
                      🟢 {t.liveExamBadge} — {lang === 'hi' ? 'परीक्षा पोर्टल खुला है!' : 'Test Engine is Active!'}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                      {[
                        { label: t.daysRemaining, val: countdown.days },
                        { label: t.hoursRemaining, val: countdown.hours },
                        { label: t.minutesRemaining, val: countdown.minutes },
                        { label: t.secondsRemaining, val: countdown.seconds }
                      ].map((item, idx) => (
                        <div key={idx} style={{ background: '#FFFFFF', padding: '0.65rem 0.25rem', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0645E5', display: 'block', lineHeight: 1.1 }}>
                            {String(item.val).padStart(2, '0')}
                          </span>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Exam Details Specs */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #CBD5E1', paddingBottom: '0.35rem' }}>
                    <span style={{ color: '#64748B' }}>📅 {t.examDateLabel}:</span>
                    <strong style={{ color: '#101B35' }}>
                      {primaryUpcoming.comp.examDate ? primaryUpcoming.comp.examDate.split('T')[0] : 'TBA'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #CBD5E1', paddingBottom: '0.35rem' }}>
                    <span style={{ color: '#64748B' }}>⏰ {t.examTimeLabel}:</span>
                    <strong style={{ color: '#101B35' }}>
                      {primaryUpcoming.comp.startTime} - {primaryUpcoming.comp.endTime} ({primaryUpcoming.comp.durationMinutes} mins)
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #CBD5E1', paddingBottom: '0.35rem' }}>
                    <span style={{ color: '#64748B' }}>📍 {lang === 'hi' ? 'स्थान / माध्यम' : 'Platform / Venue'}:</span>
                    <strong style={{ color: '#0645E5' }}>
                      {primaryUpcoming.registration?.examMode === 'OMR' ? t.examPlatformOmr : t.examPlatformOnline}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>🎯 {t.marksLabel}:</span>
                    <strong style={{ color: '#101B35' }}>
                      {primaryUpcoming.comp.totalMarks} {lang === 'hi' ? 'अंक' : 'Marks'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Actions & Instructions Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem' }}>
                {/* Guidelines note */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.825rem' }}>
                  <span>💡</span>
                  <span>{t.guideline1}</span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {primaryUpcoming.isRegistered && primaryUpcoming.registration.examMode === 'OMR' && (
                    <button
                      type="button"
                      onClick={() => setHallTicketModal({ open: true, registration: primaryUpcoming.registration })}
                      style={{
                        background: '#FFFFFF',
                        color: '#0645E5',
                        border: '1.5px solid #0645E5',
                        padding: '0.6rem 1.25rem',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                    >
                      <span>📥</span>
                      <span>{t.downloadHallTicket}</span>
                    </button>
                  )}

                  {primaryUpcoming.isRegistered && primaryUpcoming.registration.examMode === 'ONLINE_MCQ' && (
                    <button
                      type="button"
                      onClick={() => onStartExam && onStartExam(primaryUpcoming.comp.id)}
                      style={{
                        background: '#0645E5',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '0.65rem 1.4rem',
                        borderRadius: '10px',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 15px rgba(6, 69, 229, 0.3)'
                      }}
                    >
                      <span>🚀</span>
                      <span>{t.btnStartExam}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Exam-Day Guidelines Pill Box */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '1rem',
                fontSize: '0.825rem',
                color: '#475569'
              }}>
                <strong style={{ color: '#101B35', display: 'block', marginBottom: '0.35rem' }}>
                  📋 {t.examDayGuidelines}:
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                  <li>{t.guideline1}</li>
                  <li>{t.guideline2}</li>
                  <li>{t.guideline3}</li>
                </ul>
              </div>
            </div>
          ) : (
            <div style={{
              background: '#FFFFFF',
              border: '1px dashed #CBD5E1',
              borderRadius: '16px',
              padding: '2.5rem',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>📅</span>
              <p style={{ color: '#64748B', fontSize: '0.95rem', margin: 0 }}>
                {t.noUpcomingExam}
              </p>
            </div>
          )}
        </section>

        {/* ================= DESKTOP TABS NAVIGATION (Responsive) ================= */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          background: '#FFFFFF',
          padding: '0.4rem',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          marginBottom: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          {[
            { id: 'my-exams', label: t.navMyExams, icon: '📝' },
            { id: 'explore', label: t.navExplore, icon: '🧭' },
            { id: 'ranks', label: t.navRanks, icon: '🏆' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                border: 'none',
                background: activeTab === tab.id ? '#0645E5' : 'transparent',
                color: activeTab === tab.id ? '#FFFFFF' : '#64748B',
                fontWeight: 700,
                fontSize: '0.875rem',
                padding: '0.65rem 1rem',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ================= 4. REGISTERED COMPETITIONS ================= */}
        {(activeTab === 'my-exams' || activeTab === 'all') && (
          <section style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '4px', height: '22px', background: '#0645E5', borderRadius: '2px' }} />
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                    {t.myRegistrations}
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    {t.myRegistrationsSubtitle}
                  </span>
                </div>
              </div>
              <span style={{ background: '#EFF6FF', color: '#0645E5', padding: '0.2rem 0.65rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700 }}>
                {registrations.length} {lang === 'hi' ? 'दर्ज' : 'Enrolled'}
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <span>⏳ {t.connecting}</span>
              </div>
            ) : registrations.length === 0 ? (
              <div style={{
                background: '#FFFFFF',
                border: '1px dashed #CBD5E1',
                borderRadius: '16px',
                padding: '3rem 1.5rem',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>📋</span>
                <p style={{ color: '#64748B', fontSize: '0.95rem', margin: 0, marginBottom: '1rem' }}>
                  {t.noRegistrationsYet}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('explore')}
                  style={{
                    background: '#0645E5',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🧭 {t.navExplore}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {registrations.map((reg) => {
                  const comp = reg.competition || {};
                  const matchedResult = myResults.find((r) => (r.competitionId === comp.id || r.competition?.id === comp.id));

                  return (
                    <div
                      key={reg.id}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        padding: '1.35rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1.25rem'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                            {comp.title || 'Academic Competition'}
                          </h4>
                          <span style={{ background: '#DCFCE7', color: '#15803D', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                            ● {t.statusConfirmed}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: '#64748B', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          <span>📅 {t.examDateLabel}: <strong>{comp.examDate ? comp.examDate.split('T')[0] : 'N/A'}</strong></span>
                          <span>⏰ {t.examTimeLabel}: <strong>{comp.startTime} - {comp.endTime}</strong></span>
                          <span>⏳ {t.durationLabel}: <strong>{comp.durationMinutes} {lang === 'hi' ? 'मिनट' : 'mins'}</strong></span>
                        </div>
                      </div>

                      {/* Right Badges & Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* Roll Number Pill */}
                        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '0.45rem 0.85rem', borderRadius: '10px', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.65rem', color: '#0645E5', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                            {t.rollNumberLabel}
                          </span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#101B35' }}>
                            {reg.rollNumber}
                          </span>
                        </div>

                        {/* Mode Badge */}
                        <div style={{
                          background: reg.examMode === 'OMR' ? '#FEF3C7' : '#F0F2F6',
                          border: `1px solid ${reg.examMode === 'OMR' ? '#FDE68A' : '#E2E8F0'}`,
                          padding: '0.45rem 0.85rem',
                          borderRadius: '10px'
                        }}>
                          <span style={{ fontSize: '0.65rem', color: reg.examMode === 'OMR' ? '#92400E' : '#64748B', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                            {t.confirmedModeLabel}
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: reg.examMode === 'OMR' ? '#B45309' : '#101B35' }}>
                            {reg.examMode === 'OMR' ? '✍️ Paper OMR' : '📱 Online MCQ'}
                          </span>
                        </div>

                        {/* Hall Ticket Button for OMR */}
                        {reg.examMode === 'OMR' && (
                          <button
                            type="button"
                            onClick={() => setHallTicketModal({ open: true, registration: reg })}
                            style={{
                              background: '#F0F2F6',
                              color: '#0645E5',
                              border: '1px solid #BFDBFE',
                              padding: '0.55rem 0.85rem',
                              borderRadius: '10px',
                              fontWeight: 700,
                              fontSize: '0.825rem',
                              cursor: 'pointer'
                            }}
                          >
                            📥 {t.downloadHallTicket}
                          </button>
                        )}

                        {/* Start Exam Button for Online MCQ */}
                        {reg.examMode === 'ONLINE_MCQ' && (
                          <button
                            type="button"
                            onClick={() => onStartExam && onStartExam(comp.id || reg.competitionId)}
                            style={{
                              background: '#0645E5',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '0.55rem 1rem',
                              borderRadius: '10px',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem'
                            }}
                          >
                            <span>🚀</span>
                            <span>{t.btnStartExam}</span>
                          </button>
                        )}

                        {/* If Result is Published */}
                        {matchedResult && (
                          <button
                            type="button"
                            onClick={() => setScorecardModal({ open: true, result: matchedResult })}
                            style={{
                              background: '#10B981',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '0.55rem 1rem',
                              borderRadius: '10px',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              cursor: 'pointer'
                            }}
                          >
                            📊 {t.viewScorecardBtn}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ================= 5. SCHOLARSHIPS AND OPPORTUNITIES ================= */}
        {(activeTab === 'explore' || activeTab === 'all') && (
          <section style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '4px', height: '22px', background: '#0645E5', borderRadius: '2px' }} />
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                    {t.scholarshipsTitle}
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    {t.scholarshipsSubtitle}
                  </span>
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <span>⏳ {t.connecting}</span>
              </div>
            ) : competitions.length === 0 ? (
              <div style={{
                background: '#FFFFFF',
                border: '1px dashed #CBD5E1',
                borderRadius: '16px',
                padding: '3rem',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>⏳</span>
                <p style={{ color: '#64748B', fontSize: '0.95rem', margin: 0 }}>
                  {t.noAvailableComps}
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {competitions.map((comp) => {
                  const existingReg = getRegistrationForComp(comp.id);
                  const isEligible = checkEligibility(comp);
                  const windowStatus = checkRegistrationWindow(comp);

                  return (
                    <div
                      key={comp.id}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '18px',
                        padding: '1.5rem',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        {/* Title & Category Tag */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <span style={{ background: '#EFF6FF', color: '#0645E5', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {comp.category || 'Academic Talent'}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                            🎯 {comp.totalMarks} {lang === 'hi' ? 'अंक' : 'Marks'}
                          </span>
                        </div>

                        <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#101B35', margin: '0 0 0.4rem 0' }}>
                          {comp.title}
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
                          {comp.description}
                        </p>
                      </div>

                      <div>
                        {/* Specs row */}
                        <div style={{
                          background: '#F0F2F6',
                          borderRadius: '10px',
                          padding: '0.75rem',
                          fontSize: '0.8rem',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '0.5rem',
                          marginBottom: '1rem'
                        }}>
                          <div>
                            <span style={{ color: '#64748B', display: 'block' }}>📅 {t.examDateLabel}:</span>
                            <strong style={{ color: '#101B35' }}>{comp.examDate ? comp.examDate.split('T')[0] : 'N/A'}</strong>
                          </div>
                          <div>
                            <span style={{ color: '#64748B', display: 'block' }}>⏳ {t.durationLabel}:</span>
                            <strong style={{ color: '#101B35' }}>{comp.durationMinutes} mins</strong>
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <span style={{ color: '#64748B', display: 'block' }}>🏷️ {t.eligibleClassesLabel}:</span>
                            <strong style={{ color: '#101B35' }}>
                              {Array.isArray(comp.eligibleClasses) ? comp.eligibleClasses.join(', ') : comp.eligibleClasses}
                            </strong>
                          </div>
                        </div>

                        {/* Register Action CTA */}
                        {existingReg ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#DCFCE7', padding: '0.5rem 0.85rem', borderRadius: '10px', border: '1px solid #86EFAC' }}>
                            <span style={{ color: '#166534', fontWeight: 700, fontSize: '0.825rem' }}>
                              ✓ {t.alreadyRegistered}
                            </span>
                            <span style={{ background: '#166534', color: '#FFFFFF', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                              {existingReg.rollNumber}
                            </span>
                          </div>
                        ) : windowStatus === 'CLOSED' ? (
                          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.5rem', borderRadius: '10px', textAlign: 'center', fontSize: '0.825rem', fontWeight: 700 }}>
                            ⚠️ {t.registrationClosed}
                          </div>
                        ) : windowStatus === 'NOT_OPEN' ? (
                          <div style={{ background: '#FEF3C7', color: '#92400E', padding: '0.5rem', borderRadius: '10px', textAlign: 'center', fontSize: '0.825rem', fontWeight: 700 }}>
                            ⏳ {t.registrationNotStarted}
                          </div>
                        ) : !isEligible ? (
                          <div style={{ background: '#F1F5F9', color: '#64748B', padding: '0.5rem', borderRadius: '10px', textAlign: 'center', fontSize: '0.825rem', fontWeight: 600 }}>
                            🚫 {t.notEligible}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openRegisterModal(comp)}
                            style={{
                              width: '100%',
                              background: '#0645E5',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '0.6rem 1rem',
                              borderRadius: '10px',
                              fontWeight: 700,
                              fontSize: '0.875rem',
                              cursor: 'pointer',
                              boxShadow: '0 4px 12px rgba(6,69,229,0.2)'
                            }}
                          >
                            📝 {t.registerForCompBtn}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ================= 6. RESULTS & RANKS SECTION ================= */}
        {(activeTab === 'ranks' || activeTab === 'all') && (
          <section style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '4px', height: '22px', background: '#0645E5', borderRadius: '2px' }} />
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                    {t.myScorecard}
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    {t.scorecardNotice}
                  </span>
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <span>⏳ {t.connecting}</span>
              </div>
            ) : myResults.length === 0 ? (
              <div style={{
                background: '#FFFFFF',
                border: '1px dashed #CBD5E1',
                borderRadius: '16px',
                padding: '3rem',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🏅</span>
                <p style={{ color: '#64748B', fontSize: '0.95rem', margin: 0 }}>
                  {t.noPublishedResults}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {myResults.map((result) => (
                  <div
                    key={result.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '18px',
                      padding: '1.5rem',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#101B35', margin: '0 0 0.35rem 0' }}>
                          {result.competitionTitle || result.competition?.title || 'Academic Competition'}
                        </h4>
                        <div style={{ fontSize: '0.825rem', color: '#64748B', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          <span>{t.rollNumberLabel}: <strong style={{ color: '#0645E5' }}>{result.rollNumber}</strong></span>
                          <span>{t.candidateName}: <strong>{result.studentName}</strong></span>
                        </div>
                      </div>

                      {/* Rank Trophy Badge */}
                      <div style={{
                        background: result.rank === 1 ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                          : result.rank === 2 ? 'linear-gradient(135deg, #94A3B8 0%, #64748B 100%)'
                          : result.rank === 3 ? 'linear-gradient(135deg, #CD7F32 0%, #A0522D 100%)'
                          : 'linear-gradient(135deg, #0645E5 0%, #101B35 100%)',
                        color: '#FFFFFF',
                        padding: '0.6rem 1.1rem',
                        borderRadius: '12px',
                        textAlign: 'center',
                        minWidth: '85px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}>
                        <span style={{ display: 'block', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                          {lang === 'hi' ? 'रैंक' : 'Rank'}
                        </span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1.1 }}>
                          {result.rank === 1 ? '🥇 #1' : result.rank === 2 ? '🥈 #2' : result.rank === 3 ? '🥉 #3' : `#${result.rank}`}
                        </span>
                      </div>
                    </div>

                    {/* Breakdown Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                      <div style={{ background: '#101B35', color: '#FFFFFF', borderRadius: '12px', padding: '0.85rem', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.8, textTransform: 'uppercase' }}>{t.finalScore}</span>
                        <span style={{ fontSize: '1.6rem', fontWeight: 900 }}>{result.finalScore}</span>
                        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}> / {result.maximumMarks}</span>
                      </div>
                      <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '12px', padding: '0.85rem', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#166534', textTransform: 'uppercase' }}>{t.correctAnswers}</span>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D' }}>✓ {result.correctAnswers}</span>
                      </div>
                      <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '12px', padding: '0.85rem', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#991B1B', textTransform: 'uppercase' }}>{t.incorrectAnswers}</span>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B91C1C' }}>✗ {result.incorrectAnswers}</span>
                      </div>
                      <div style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '12px', padding: '0.85rem', textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#475569', textTransform: 'uppercase' }}>{t.unanswered}</span>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#64748B' }}>— {result.unansweredQuestions}</span>
                      </div>
                    </div>

                    {/* Buttons: Public Merit List & Detailed Scorecard */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {result.isPublicMeritListEnabled && (
                        <button
                          type="button"
                          onClick={() => fetchPublicMerit(result.competitionId || result.competition?.id, result.competitionTitle || result.competition?.title)}
                          style={{
                            background: '#FFFFFF',
                            border: '1.5px solid #0645E5',
                            color: '#0645E5',
                            padding: '0.5rem 1rem',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          <span>🏅</span>
                          <span>{t.viewPublicMerit}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ================= 7. HELP DESK & SUPPORT ================= */}
        <section style={{
          background: '#F0F2F6',
          border: '1px solid #E2E8F0',
          borderRadius: '20px',
          padding: '1.75rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📞</span>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                {t.helpDeskTitle}
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                {t.helpDeskSubtitle}
              </p>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginTop: '1.25rem',
            marginBottom: '1.25rem'
          }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', textTransform: 'uppercase' }}>{t.helpDeskHelpline}</span>
              <strong style={{ fontSize: '1rem', color: '#0645E5', display: 'block', marginTop: '0.2rem' }}>+91 94150 12345</strong>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>10:00 AM – 05:00 PM</span>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', textTransform: 'uppercase' }}>{t.helpDeskEmail}</span>
              <strong style={{ fontSize: '0.95rem', color: '#101B35', display: 'block', marginTop: '0.2rem' }}>helpdesk@shikshasamiti.org</strong>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Response within 24 hours</span>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', textTransform: 'uppercase' }}>{t.helpDeskCenter}</span>
              <strong style={{ fontSize: '0.95rem', color: '#101B35', display: 'block', marginTop: '0.2rem' }}>District Education Office</strong>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Center Coordinator Cell</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setHelpModalOpen(true)}
              style={{
                background: '#101B35',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.6rem 1.25rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              💬 {t.helpDeskRaiseQuery}
            </button>
          </div>
        </section>
      </main>

      {/* ================= 8. BOTTOM NAVIGATION (Mobile Fixed / Sticky) ================= */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#FFFFFF',
        borderTop: '1px solid #E2E8F0',
        padding: '0.5rem 1rem',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 90,
        boxShadow: '0 -4px 15px rgba(0,0,0,0.05)'
      }}>
        {[
          { id: 'explore', label: t.navExplore, icon: '🧭' },
          { id: 'my-exams', label: t.navMyExams, icon: '📝' },
          { id: 'ranks', label: t.navRanks, icon: '🏆' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              border: 'none',
              background: 'transparent',
              color: activeTab === tab.id ? '#0645E5' : '#64748B',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.2rem',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: activeTab === tab.id ? 800 : 600,
              padding: '0.3rem 0.75rem',
              borderRadius: '8px'
            }}
          >
            <span style={{ fontSize: '1.25rem', transform: activeTab === tab.id ? 'scale(1.15)' : 'none', transition: 'transform 0.15s ease' }}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}

        {/* Admin Portal Tab (ONLY if role is admin) */}
        {user?.role === 'admin' && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#EF4444',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.2rem',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.3rem 0.75rem'
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>🛡️</span>
            <span>{t.navAdmin}</span>
          </button>
        )}
      </nav>

      {/* ================= MODAL: HALL TICKET / ADMIT CARD ================= */}
      {hallTicketModal.open && hallTicketModal.registration && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16, 27, 53, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: '1rem',
            overflowY: 'auto'
          }}
        >
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '600px',
            padding: '2rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{ borderBottom: '2px solid #101B35', paddingBottom: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>🎓</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#101B35', margin: 0 }}>
                {t.hallTicketModalTitle}
              </h3>
              <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>
                {hallTicketModal.registration.competition?.title}
              </span>
            </div>

            {/* Candidate & Exam Slip Grid */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              fontSize: '0.875rem',
              marginBottom: '1.5rem'
            }}>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>{t.rollNumberLabel}:</span>
                <strong style={{ fontSize: '1.2rem', color: '#0645E5', letterSpacing: '0.05em' }}>
                  {hallTicketModal.registration.rollNumber}
                </strong>
              </div>

              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>{t.candidateName}:</span>
                <strong style={{ color: '#101B35' }}>{user?.fullName}</strong>
              </div>

              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>{t.schoolLabel}:</span>
                <strong style={{ color: '#101B35' }}>{user?.school}</strong>
              </div>

              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>{t.classLabel}:</span>
                <strong style={{ color: '#101B35' }}>{user?.classOrGrade}</strong>
              </div>

              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>{t.examDateLabel}:</span>
                <strong style={{ color: '#101B35' }}>
                  {hallTicketModal.registration.competition?.examDate ? hallTicketModal.registration.competition.examDate.split('T')[0] : 'N/A'}
                </strong>
              </div>

              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>{t.examTimeLabel}:</span>
                <strong style={{ color: '#101B35' }}>
                  {hallTicketModal.registration.competition?.startTime} - {hallTicketModal.registration.competition?.endTime}
                </strong>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>{t.confirmedModeLabel}:</span>
                <strong style={{ color: '#B45309' }}>
                  ✍️ {hallTicketModal.registration.examMode === 'OMR' ? 'Paper OMR Sheet Examination' : 'Online MCQ Examination'}
                </strong>
              </div>
            </div>

            {/* QR Verification Placeholder */}
            <div style={{
              border: '2px dashed #CBD5E1',
              borderRadius: '12px',
              padding: '1rem',
              textAlign: 'center',
              marginBottom: '1.5rem',
              background: '#FFFFFF'
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.25rem' }}>🏁</div>
              <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', fontFamily: 'monospace' }}>
                TOKEN: {hallTicketModal.registration.omrSheetToken || `OMR-${hallTicketModal.registration.rollNumber}-AUTH`}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 700 }}>
                ✓ Official HMAC Verification Active
              </span>
            </div>

            {/* Instructions */}
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '0.85rem', borderRadius: '10px', fontSize: '0.8rem', color: '#92400E', marginBottom: '1.5rem' }}>
              <strong>⚠️ {t.examDayGuidelines}:</strong>
              <p style={{ margin: '0.35rem 0 0 0' }}>{t.hallTicketNotice}</p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setHallTicketModal({ open: false, registration: null })}
                style={{
                  background: '#F0F2F6',
                  color: '#475569',
                  border: 'none',
                  padding: '0.6rem 1.25rem',
                  borderRadius: '10px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {lang === 'hi' ? 'बंद करें' : 'Close'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  background: '#0645E5',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.6rem 1.4rem',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(6,69,229,0.3)'
                }}
              >
                🖨️ {t.hallTicketPrintBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: PUBLIC MERIT LIST ================= */}
      {publicMeritModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16, 27, 53, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: '1rem',
            overflowY: 'auto'
          }}
        >
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '860px',
            padding: '2rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                  🏅 {t.publicMeritList}
                </h3>
                <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
                  {publicMeritModal.competitionTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPublicMeritModal({ open: false, competitionTitle: '', list: [], loading: false, error: null })}
                style={{ background: 'none', border: 'none', fontSize: '1.35rem', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {publicMeritModal.loading ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <span style={{ fontSize: '2rem' }}>⏳</span>
                <p style={{ color: '#64748B', marginTop: '0.5rem' }}>{t.connecting}</p>
              </div>
            ) : publicMeritModal.error ? (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                ⚠️ {publicMeritModal.error}
              </div>
            ) : publicMeritModal.list.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                {lang === 'hi' ? 'अभी तक कोई मेरिट सूची उपलब्ध नहीं है।' : 'No merit list entries available yet.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: '#101B35', color: '#FFFFFF' }}>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRadius: '8px 0 0 0' }}>{lang === 'hi' ? 'रैंक' : 'Rank'}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>{t.rollNumber}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>{t.candidateName}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>{t.school}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{t.classGrade}</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center', borderRadius: '0 8px 0 0' }}>{t.finalScore}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicMeritModal.list.map((entry, idx) => (
                      <tr
                        key={entry.rollNumber || idx}
                        style={{
                          background: idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
                          borderBottom: '1px solid #E2E8F0'
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 800 }}>
                          {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#0645E5', fontWeight: 700 }}>
                          {entry.rollNumber}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#101B35' }}>
                          {entry.studentName}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#64748B' }}>
                          {entry.school || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          {entry.classOrGrade || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 800, color: '#0645E5' }}>
                          {entry.finalScore} / {entry.maximumMarks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setPublicMeritModal({ open: false, competitionTitle: '', list: [], loading: false, error: null })}
                style={{
                  background: '#F0F2F6',
                  color: '#475569',
                  border: 'none',
                  padding: '0.55rem 1.25rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {lang === 'hi' ? 'बंद करें' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: REGISTER FOR COMPETITION ================= */}
      {registeringComp && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16, 27, 53, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: '1rem',
            overflowY: 'auto'
          }}
        >
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '520px',
            padding: '2rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                {t.registerForCompBtn}
              </h3>
              <button
                type="button"
                onClick={() => setRegisteringComp(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {regModalError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {regModalError}
              </div>
            )}

            <form onSubmit={handleConfirmRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0645E5', margin: '0 0 0.25rem 0' }}>
                  {registeringComp.title}
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0 }}>
                  {registeringComp.description}
                </p>
              </div>

              {/* Student info confirmation */}
              <div style={{ background: '#F0F2F6', padding: '0.85rem', borderRadius: '10px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>{lang === 'hi' ? 'छात्र का नाम' : 'Student'}:</span>
                  <strong>{user?.fullName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>{t.classLabel}:</span>
                  <strong>{user?.classOrGrade}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>{t.examDateLabel}:</span>
                  <strong>{registeringComp.examDate ? registeringComp.examDate.split('T')[0] : 'N/A'} ({registeringComp.startTime})</strong>
                </div>
              </div>

              {/* Exam Mode Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 800, color: '#101B35', marginBottom: '0.5rem' }}>
                  {t.selectExamMode} *
                </label>

                {registeringComp.mode === 'BOTH' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.85rem',
                      borderRadius: '10px',
                      border: chosenMode === 'ONLINE_MCQ' ? '2px solid #0645E5' : '1px solid #E2E8F0',
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
                        <strong style={{ display: 'block', color: '#0645E5', fontSize: '0.9rem' }}>📱 {t.modeOnline}</strong>
                        <span style={{ fontSize: '0.775rem', color: '#64748B' }}>{lang === 'hi' ? 'मोबाइल, कंप्यूटर या टैबलेट पर ऑनलाइन परीक्षा दें' : 'Take timed exam on your smartphone or computer'}</span>
                      </div>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.85rem',
                      borderRadius: '10px',
                      border: chosenMode === 'OMR' ? '2px solid #D97706' : '1px solid #E2E8F0',
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
                        <span style={{ fontSize: '0.775rem', color: '#64748B' }}>{lang === 'hi' ? 'परीक्षा केंद्र पर मुद्रित ओएमआर शीट में पेन द्वारा परीक्षा दें' : 'Fill paper bubbles at designated physical exam center'}</span>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem', background: '#F0F2F6', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 700 }}>
                    {registeringComp.mode === 'ONLINE_MCQ' ? `📱 ${t.modeOnline}` : `✍️ ${t.modeOmr}`}
                  </div>
                )}
              </div>

              {/* Warning Notice: Exam Mode is Permanently Locked */}
              <div style={{ background: '#FFF7ED', border: '1px solid #FFEDD5', borderRadius: '10px', padding: '0.75rem', fontSize: '0.8rem', color: '#C2410C', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span>🔒</span>
                <span>{t.examModeNotice}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setRegisteringComp(null)}
                  disabled={registerSubmitting}
                  style={{
                    background: '#F0F2F6',
                    color: '#475569',
                    border: 'none',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={registerSubmitting}
                  style={{
                    background: '#0645E5',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.55rem 1.5rem',
                    borderRadius: '8px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(6,69,229,0.25)'
                  }}
                >
                  {registerSubmitting ? '...' : t.registerForCompBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: HELP DESK FAQs ================= */}
      {helpModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16, 27, 53, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: '1rem'
          }}
        >
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '540px',
            padding: '2rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#101B35', margin: 0 }}>
                💬 {t.helpDeskTitle}
              </h3>
              <button
                type="button"
                onClick={() => setHelpModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
              <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <strong style={{ color: '#101B35', display: 'block', marginBottom: '0.25rem' }}>
                  {lang === 'hi' ? '❓ परीक्षा के दिन क्या साथ लाना अनिवार्य है?' : '❓ What should I bring on exam day?'}
                </strong>
                <span style={{ color: '#64748B' }}>
                  {lang === 'hi' ? 'प्रवेश पत्र (हॉल टिकट), विद्यालय का पहचान पत्र, और ओएमआर हेतु काला/नीला बॉलपॉइंट पेन।' : 'Printed Hall Ticket, School ID Card, and black/blue ballpoint pen for OMR.'}
                </span>
              </div>

              <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <strong style={{ color: '#101B35', display: 'block', marginBottom: '0.25rem' }}>
                  {lang === 'hi' ? '❓ क्या परीक्षा माध्यम बदला जा सकता है?' : '❓ Can I change my exam mode after registration?'}
                </strong>
                <span style={{ color: '#64748B' }}>
                  {lang === 'hi' ? 'सुरक्षा नियमों के अनुसार पंजीकरण के उपरांत परीक्षा माध्यम स्थायी रूप से लॉक रहता है।' : 'For examination integrity, exam mode is permanently locked after registration.'}
                </span>
              </div>

              <div style={{ background: '#EFF6FF', padding: '0.85rem', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                <strong style={{ color: '#0645E5', display: 'block', marginBottom: '0.25rem' }}>
                  {t.helpDeskHelpline}: +91 94150 12345
                </strong>
                <span style={{ color: '#1E40AF', fontSize: '0.8rem' }}>
                  {t.helpDeskEmail}: helpdesk@shikshasamiti.org
                </span>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setHelpModalOpen(false)}
                style={{
                  background: '#0645E5',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.55rem 1.4rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {lang === 'hi' ? 'ठीक है' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
