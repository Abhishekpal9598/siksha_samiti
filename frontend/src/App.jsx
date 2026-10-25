import React, { useState, useEffect } from 'react';
import { translations } from './translations.js';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import ExamModes from './components/ExamModes.jsx';
import CompetitionInfo from './components/CompetitionInfo.jsx';
import Footer from './components/Footer.jsx';
import ActionModal from './components/ActionModal.jsx';
import RegisterModal from './components/RegisterModal.jsx';
import LoginModal from './components/LoginModal.jsx';
import StudentDashboard from './components/StudentDashboard.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import ExamRunner from './components/ExamRunner.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
const STORAGE_KEY = 'education_committee_lang';

export default function App() {
  // 1. Language persistence: check URL param first, then localStorage, defaulting to Hindi ('hi')
  const [lang, setLang] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryLang = urlParams.get('lang');
      if (queryLang === 'en' || queryLang === 'hi') {
        localStorage.setItem(STORAGE_KEY, queryLang);
        return queryLang;
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'en' ? 'en' : 'hi';
    } catch {
      return 'hi';
    }
  });

  // Current active view: 'home' | 'student-dashboard' | 'admin-dashboard' | 'exam-runner'
  const [view, setView] = useState('home');
  const [activeExamCompId, setActiveExamCompId] = useState(null);

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState(null);

  const [healthStatus, setHealthStatus] = useState({
    state: 'loading',
    data: null,
    error: null
  });

  const [modalState, setModalState] = useState({
    isOpen: false,
    actionName: ''
  });

  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [loginModalState, setLoginModalState] = useState({
    isOpen: false,
    targetRole: 'student'
  });

  // Dedicated language handler that updates state and persists to localStorage
  const handleSetLang = (newLang) => {
    const chosen = newLang === 'en' ? 'en' : 'hi';
    setLang(chosen);
    try {
      localStorage.setItem(STORAGE_KEY, chosen);
    } catch (e) {
      console.warn('Could not save language to localStorage:', e);
    }
  };

  // Active translation dictionary
  const t = translations[lang] || translations.hi;

  // 1. Check active session on load via GET /api/v1/auth/me (HttpOnly cookie)
  const checkCurrentSession = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        credentials: 'include' // sends HttpOnly auth_token cookie
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setCurrentUser(data.user);
          // If already authenticated and not on a specific view, keep them on dashboard
          if (data.user.role === 'admin') {
            setView('admin-dashboard');
          } else if (data.user.role === 'student') {
            setView('student-dashboard');
          }
        }
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    }
  };

  // 2. Preserved backend health check from Phase 1
  const checkHealth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setHealthStatus({
        state: 'connected',
        data,
        error: null
      });
    } catch (err) {
      setHealthStatus({
        state: 'disconnected',
        data: null,
        error: err.message
      });
    }
  };

  useEffect(() => {
    checkHealth();
    checkCurrentSession();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleActionClick = (actionName) => {
    // 1. Student Registration
    const isRegister = 
      actionName === t.studentRegister ||
      actionName === translations.hi.studentRegister ||
      actionName === translations.en.studentRegister ||
      actionName === t.ctaRegister ||
      actionName === translations.hi.ctaRegister ||
      actionName === translations.en.ctaRegister ||
      actionName === 'register';

    // 2. Student Login
    const isStudentLogin = 
      actionName === t.studentLogin ||
      actionName === translations.hi.studentLogin ||
      actionName === translations.en.studentLogin ||
      actionName === t.ctaLogin ||
      actionName === translations.hi.ctaLogin ||
      actionName === translations.en.ctaLogin ||
      actionName === 'studentLogin';

    // 3. Admin Login
    const isAdminLogin = 
      actionName === t.adminLogin ||
      actionName === translations.hi.adminLogin ||
      actionName === translations.en.adminLogin ||
      actionName === 'adminLogin';

    if (isRegister) {
      setRegisterModalOpen(true);
    } else if (isStudentLogin) {
      // If student already logged in, navigate directly to dashboard
      if (currentUser && currentUser.role === 'student') {
        setView('student-dashboard');
      } else {
        setLoginModalState({ isOpen: true, targetRole: 'student' });
      }
    } else if (isAdminLogin) {
      // If admin already logged in, navigate directly to dashboard
      if (currentUser && currentUser.role === 'admin') {
        setView('admin-dashboard');
      } else {
        setLoginModalState({ isOpen: true, targetRole: 'admin' });
      }
    } else {
      setModalState({
        isOpen: true,
        actionName
      });
    }
  };

  const closeModal = () => {
    setModalState({
      isOpen: false,
      actionName: ''
    });
  };

  // Called when login is successful from LoginModal
  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setLoginModalState({ isOpen: false, targetRole: 'student' });
    if (user.role === 'admin') {
      setView('admin-dashboard');
    } else {
      setView('student-dashboard');
    }
  };

  // Called when user logs out
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });
    } catch (err) {
      console.warn('Logout request failed:', err);
    }
    setCurrentUser(null);
    setView('home');
  };

  // --- RENDER ONLINE EXAM RUNNER ---
  if (view === 'exam-runner' && currentUser && currentUser.role === 'student' && activeExamCompId) {
    return (
      <ExamRunner 
        competitionId={activeExamCompId}
        user={currentUser}
        onExit={() => {
          setActiveExamCompId(null);
          setView('student-dashboard');
        }}
        lang={lang}
        setLang={handleSetLang}
        t={t}
      />
    );
  }

  // --- RENDER PROTECTED STUDENT DASHBOARD ---
  if (view === 'student-dashboard' && currentUser && currentUser.role === 'student') {
    return (
      <StudentDashboard 
        user={currentUser}
        onLogout={handleLogout}
        lang={lang}
        setLang={handleSetLang}
        t={t}
        onStartExam={(compId) => {
          setActiveExamCompId(compId);
          setView('exam-runner');
        }}
      />
    );
  }

  // --- RENDER PROTECTED ADMIN DASHBOARD ---
  if (view === 'admin-dashboard' && currentUser && currentUser.role === 'admin') {
    return (
      <AdminDashboard 
        user={currentUser}
        onLogout={handleLogout}
        lang={lang}
        setLang={handleSetLang}
        t={t}
      />
    );
  }

  // --- PUBLIC HOMEPAGE (Default) ---
  return (
    <div className="app-shell">
      {/* Session Active Top Notification Pill if logged in */}
      {currentUser && (
        <div style={{
          background: currentUser.role === 'admin' ? '#0F172A' : '#1E40AF',
          color: '#FFFFFF',
          padding: '0.4rem 1.25rem',
          fontSize: '0.825rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.2)'
        }}>
          <div>
            <span>👤 {t.welcomeUser}, <strong>{currentUser.fullName}</strong> ({currentUser.role === 'admin' ? t.roleAdmin : t.roleStudent})</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setView(currentUser.role === 'admin' ? 'admin-dashboard' : 'student-dashboard')}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '4px',
                padding: '0.2rem 0.6rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              📊 {currentUser.role === 'admin' ? t.dashboardAdminTitle : t.dashboardStudentTitle}
            </button>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#FCA5A5',
                cursor: 'pointer',
                fontSize: '0.8rem',
                textDecoration: 'underline'
              }}
            >
              {t.btnLogout}
            </button>
          </div>
        </div>
      )}

      {/* Public Header */}
      <Header 
        lang={lang}
        setLang={handleSetLang}
        t={t}
        healthState={healthStatus.state}
        onActionClick={handleActionClick}
      />

      {/* Hero Section */}
      <main>
        <Hero 
          t={t}
          onActionClick={handleActionClick}
        />

        {/* Dual Examination Modes Section */}
        <ExamModes 
          t={t}
        />

        {/* Competition Information & How to Participate */}
        <CompetitionInfo 
          t={t}
          onActionClick={handleActionClick}
        />
      </main>

      {/* Public Footer */}
      <Footer 
        t={t}
        healthData={healthStatus.data}
        healthState={healthStatus.state}
      />

      {/* Phase 2: Live Student Registration Modal */}
      <RegisterModal 
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        t={t}
        lang={lang}
      />

      {/* Phase 2: Unified Student & Admin Login Modal */}
      <LoginModal 
        isOpen={loginModalState.isOpen}
        targetRole={loginModalState.targetRole}
        onClose={() => setLoginModalState({ isOpen: false, targetRole: 'student' })}
        onSuccess={handleLoginSuccess}
        onOpenRegister={() => setRegisterModalOpen(true)}
        t={t}
        lang={lang}
      />

      {/* Phase 1.5 Placeholder Notification Modal for Unimplemented Features */}
      <ActionModal 
        isOpen={modalState.isOpen}
        actionName={modalState.actionName}
        onClose={closeModal}
        t={t}
      />
    </div>
  );
}
