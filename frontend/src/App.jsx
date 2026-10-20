import React, { useState, useEffect } from 'react';
import { translations } from './translations.js';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import ExamModes from './components/ExamModes.jsx';
import CompetitionInfo from './components/CompetitionInfo.jsx';
import Footer from './components/Footer.jsx';
import ActionModal from './components/ActionModal.jsx';
import RegisterModal from './components/RegisterModal.jsx';

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

  // Preserved backend health check from Phase 1
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
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleActionClick = (actionName) => {
    const isRegisterAction = 
      actionName === t.studentRegister ||
      actionName === translations.hi.studentRegister ||
      actionName === translations.en.studentRegister ||
      actionName === t.ctaRegister ||
      actionName === translations.hi.ctaRegister ||
      actionName === translations.en.ctaRegister ||
      actionName === 'register';

    if (isRegisterAction) {
      setRegisterModalOpen(true);
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

  return (
    <div className="app-shell">
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
