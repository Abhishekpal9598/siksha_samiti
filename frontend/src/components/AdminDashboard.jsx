import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export default function AdminDashboard({ user, onLogout, lang, setLang, t }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'competitions' | 'questions'
  const [loggingOut, setLoggingOut] = useState(false);

  // Competitions state
  const [competitions, setCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [compError, setCompError] = useState(null);
  const [compSuccess, setCompSuccess] = useState(null);

  // Create/Edit Competition Modal
  const [showCompModal, setShowCompModal] = useState(false);
  const [editingCompId, setEditingCompId] = useState(null);
  const [compFormData, setCompFormData] = useState({
    title: '',
    description: '',
    examDate: '',
    startTime: '10:00',
    endTime: '12:00',
    durationMinutes: 120,
    mode: 'BOTH',
    eligibleClasses: 'Class 9, Class 10',
    totalMarks: 100,
    marksPerQuestion: 1,
    negativeMarkingEnabled: false,
    negativeDeduction: 0.25,
    registrationOpensAt: '',
    registrationClosesAt: '',
    status: 'DRAFT',
    instructions: ''
  });
  const [compSubmitting, setCompSubmitting] = useState(false);
  const [compModalError, setCompModalError] = useState(null);

  // Question Bank state
  const [selectedCompForQuestions, setSelectedCompForQuestions] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionError, setQuestionError] = useState(null);
  const [questionSuccess, setQuestionSuccess] = useState(null);

  // Attempt Monitoring state (Phase 4)
  const [selectedCompForAttempts, setSelectedCompForAttempts] = useState('');
  const [attempts, setAttempts] = useState([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [attemptsError, setAttemptsError] = useState(null);

  // Phase 5: Results, Scoring & Merit List state
  const [selectedCompForMerit, setSelectedCompForMerit] = useState('');
  const [meritData, setMeritData] = useState({ meritList: [], auditLogs: [], competition: null });
  const [loadingMerit, setLoadingMerit] = useState(false);
  const [meritError, setMeritError] = useState(null);
  const [meritSuccess, setMeritSuccess] = useState(null);
  const [meritSearch, setMeritSearch] = useState('');
  const [reasonModal, setReasonModal] = useState({ open: false, action: '', title: '', reason: '' });

  // Create/Edit Question Modal
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionFormData, setQuestionFormData] = useState({
    competitionId: '',
    prompt: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctOption: 'A',
    marks: 1,
    negativeMarks: 0,
    explanation: '',
    subject: 'General Knowledge',
    topic: 'Basic Science & Math',
    classOrGrade: 'Class 9'
  });
  const [questionSubmitting, setQuestionSubmitting] = useState(false);
  const [questionModalError, setQuestionModalError] = useState(null);

  // Common request headers helper for state-changing requests
  const getMutationHeaders = () => ({
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  });

  // Fetch Competitions
  const fetchCompetitions = async () => {
    setLoadingCompetitions(true);
    setCompError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCompetitions(data.competitions || []);
        if (data.competitions?.length > 0) {
          if (!selectedCompForQuestions) {
            setSelectedCompForQuestions(data.competitions[0].id);
          }
          if (!selectedCompForAttempts) {
            setSelectedCompForAttempts(data.competitions[0].id);
          }
          if (!selectedCompForMerit) {
            setSelectedCompForMerit(data.competitions[0].id);
          }
        }
      } else {
        setCompError(data.error?.message || 'Failed to load competitions');
      }
    } catch (err) {
      setCompError(err.message || 'Network error fetching competitions');
    } finally {
      setLoadingCompetitions(false);
    }
  };

  // Fetch Questions for a Competition
  const fetchQuestions = async (compId) => {
    if (!compId) return;
    setLoadingQuestions(true);
    setQuestionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/questions`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setQuestions(data.questions || []);
      } else {
        setQuestionError(data.error?.message || 'Failed to load questions');
      }
    } catch (err) {
      setQuestionError(err.message || 'Network error fetching questions');
    } finally {
      setLoadingQuestions(false);
    }
  };

  // Fetch Attempts for a Competition (Phase 4)
  const fetchAttempts = async (compId) => {
    if (!compId) return;
    setLoadingAttempts(true);
    setAttemptsError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/attempts`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAttempts(data.attempts || []);
      } else {
        setAttemptsError(data.error?.message || 'Failed to load attempts');
      }
    } catch (err) {
      setAttemptsError(err.message || 'Network error fetching attempts');
    } finally {
      setLoadingAttempts(false);
    }
  };

  // Fetch Merit List and Audit Logs (Phase 5)
  const fetchMerit = async (compId) => {
    if (!compId) return;
    setLoadingMerit(true);
    setMeritError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/merit-list`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeritData({
          meritList: data.meritList || [],
          auditLogs: data.auditLogs || [],
          competition: data.competition || null
        });
      } else {
        setMeritError(data.error?.message || 'Failed to load merit list');
      }
    } catch (err) {
      setMeritError(err.message || 'Network error fetching merit list');
    } finally {
      setLoadingMerit(false);
    }
  };

  const handleEvaluate = async (compId, isReEvaluation = false, reason = '') => {
    setMeritError(null);
    setMeritSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/evaluate`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({ isReEvaluation, reason })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeritSuccess(data.message || 'Scoring evaluation completed successfully.');
        await fetchMerit(compId);
        await fetchCompetitions();
      } else {
        setMeritError(data.error?.message || 'Evaluation failed.');
      }
    } catch (err) {
      setMeritError(err.message || 'Network error during evaluation.');
    }
  };

  const handleRequestApproval = async (compId) => {
    setMeritError(null);
    setMeritSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/request-approval`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeritSuccess(data.message || 'Results submitted for Committee Head approval.');
        await fetchMerit(compId);
        await fetchCompetitions();
      } else {
        setMeritError(data.error?.message || 'Failed to request approval.');
      }
    } catch (err) {
      setMeritError(err.message || 'Network error requesting approval.');
    }
  };

  const handleApprove = async (compId) => {
    setMeritError(null);
    setMeritSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/approve`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reason: 'Formal approval granted by Committee Head' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeritSuccess(data.message || 'Results approved by Committee Head.');
        await fetchMerit(compId);
        await fetchCompetitions();
      } else {
        setMeritError(data.error?.message || 'Approval failed.');
      }
    } catch (err) {
      setMeritError(err.message || 'Network error approving results.');
    }
  };

  const handleReject = async (compId, reason) => {
    setMeritError(null);
    setMeritSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/reject`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeritSuccess(data.message || 'Results returned for revision.');
        await fetchMerit(compId);
        await fetchCompetitions();
      } else {
        setMeritError(data.error?.message || 'Rejection failed.');
      }
    } catch (err) {
      setMeritError(err.message || 'Network error rejecting results.');
    }
  };

  const handlePublish = async (compId, isPublicMeritListEnabled = false) => {
    setMeritError(null);
    setMeritSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/publish`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({ isPublicMeritListEnabled })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeritSuccess(data.message || 'Results published successfully.');
        await fetchMerit(compId);
        await fetchCompetitions();
      } else {
        setMeritError(data.error?.message || 'Publication failed.');
      }
    } catch (err) {
      setMeritError(err.message || 'Network error publishing results.');
    }
  };

  const handleUnpublish = async (compId, reason) => {
    setMeritError(null);
    setMeritSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/unpublish`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeritSuccess(data.message || 'Results recalled for revision.');
        await fetchMerit(compId);
        await fetchCompetitions();
      } else {
        setMeritError(data.error?.message || 'Unpublish failed.');
      }
    } catch (err) {
      setMeritError(err.message || 'Network error unpublishing results.');
    }
  };

  const handleTogglePublic = async (compId, isEnabled) => {
    setMeritError(null);
    setMeritSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/public-merit-list`, {
        method: 'PATCH',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({ isPublicMeritListEnabled: isEnabled })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMeritSuccess(data.message || `Public merit list visibility updated.`);
        await fetchMerit(compId);
        await fetchCompetitions();
      } else {
        setMeritError(data.error?.message || 'Failed to toggle public merit list.');
      }
    } catch (err) {
      setMeritError(err.message || 'Network error updating public merit list.');
    }
  };

  useEffect(() => {
    fetchCompetitions();
  }, []);

  useEffect(() => {
    if (selectedCompForQuestions) {
      fetchQuestions(selectedCompForQuestions);
    }
  }, [selectedCompForQuestions]);

  useEffect(() => {
    if (selectedCompForAttempts) {
      fetchAttempts(selectedCompForAttempts);
    }
  }, [selectedCompForAttempts]);

  useEffect(() => {
    if (selectedCompForMerit) {
      fetchMerit(selectedCompForMerit);
    }
  }, [selectedCompForMerit]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include'
      });
    } catch (err) {
      console.warn('Admin logout failed:', err);
    } finally {
      setLoggingOut(false);
      onLogout();
    }
  };

  // --- COMPETITION MANAGEMENT HANDLERS ---
  const openCreateCompModal = () => {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setDate(today.getDate() + 30);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const regClose = new Date(today);
    regClose.setDate(today.getDate() + 25);

    const formatYMD = (d) => d.toISOString().split('T')[0];
    const formatYMDHM = (d) => d.toISOString().slice(0, 16);

    setEditingCompId(null);
    setCompFormData({
      title: '',
      description: '',
      examDate: formatYMD(nextMonth),
      startTime: '10:00',
      endTime: '12:00',
      durationMinutes: 120,
      mode: 'BOTH',
      eligibleClasses: 'Class 9, Class 10',
      totalMarks: 100,
      marksPerQuestion: 1,
      negativeMarkingEnabled: false,
      negativeDeduction: 0.25,
      registrationOpensAt: formatYMDHM(tomorrow),
      registrationClosesAt: formatYMDHM(regClose),
      status: 'DRAFT',
      instructions: 'Please reach the examination center or login 15 minutes before scheduled start time.'
    });
    setCompModalError(null);
    setShowCompModal(true);
  };

  const openEditCompModal = (comp) => {
    setEditingCompId(comp.id);
    setCompFormData({
      title: comp.title || '',
      description: comp.description || '',
      examDate: comp.examDate ? comp.examDate.split('T')[0] : '',
      startTime: comp.startTime || '10:00',
      endTime: comp.endTime || '12:00',
      durationMinutes: comp.durationMinutes || 120,
      mode: comp.mode || 'BOTH',
      eligibleClasses: Array.isArray(comp.eligibleClasses) ? comp.eligibleClasses.join(', ') : comp.eligibleClasses || '',
      totalMarks: comp.totalMarks || 100,
      marksPerQuestion: comp.marksPerQuestion || 1,
      negativeMarkingEnabled: Boolean(comp.negativeMarking?.enabled),
      negativeDeduction: comp.negativeMarking?.deduction || 0.25,
      registrationOpensAt: comp.registrationOpensAt ? comp.registrationOpensAt.slice(0, 16) : '',
      registrationClosesAt: comp.registrationClosesAt ? comp.registrationClosesAt.slice(0, 16) : '',
      status: comp.status || 'DRAFT',
      instructions: comp.instructions || ''
    });
    setCompModalError(null);
    setShowCompModal(true);
  };

  const handleSaveCompetition = async (e) => {
    e.preventDefault();
    setCompSubmitting(true);
    setCompModalError(null);

    const payload = {
      title: compFormData.title.trim(),
      description: compFormData.description.trim(),
      examDate: compFormData.examDate,
      startTime: compFormData.startTime,
      endTime: compFormData.endTime,
      durationMinutes: Number(compFormData.durationMinutes),
      mode: compFormData.mode,
      eligibleClasses: compFormData.eligibleClasses.split(',').map((c) => c.trim()).filter(Boolean),
      totalMarks: Number(compFormData.totalMarks),
      marksPerQuestion: Number(compFormData.marksPerQuestion),
      negativeMarking: {
        enabled: compFormData.negativeMarkingEnabled,
        deduction: compFormData.negativeMarkingEnabled ? Number(compFormData.negativeDeduction) : 0
      },
      registrationOpensAt: compFormData.registrationOpensAt ? new Date(compFormData.registrationOpensAt).toISOString() : undefined,
      registrationClosesAt: compFormData.registrationClosesAt ? new Date(compFormData.registrationClosesAt).toISOString() : undefined,
      instructions: compFormData.instructions.trim()
    };

    if (!editingCompId) {
      payload.status = compFormData.status || 'DRAFT';
    }

    try {
      const url = editingCompId 
        ? `${API_BASE_URL}/admin/competitions/${editingCompId}`
        : `${API_BASE_URL}/admin/competitions`;
      const method = editingCompId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getMutationHeaders(),
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowCompModal(false);
        setCompSuccess(editingCompId ? t.competitionUpdatedSuccess : t.competitionCreatedSuccess);
        setTimeout(() => setCompSuccess(null), 4000);
        await fetchCompetitions();
      } else {
        setCompModalError(data.error?.message || (data.error?.details && data.error.details.join(', ')) || 'Failed to save competition.');
      }
    } catch (err) {
      setCompModalError(err.message || 'Network error.');
    } finally {
      setCompSubmitting(false);
    }
  };

  const handleStatusChange = async (compId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/competitions/${compId}/status`, {
        method: 'PATCH',
        headers: getMutationHeaders(),
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCompSuccess(t.statusUpdatedSuccess);
        setTimeout(() => setCompSuccess(null), 3500);
        await fetchCompetitions();
      } else {
        alert(data.error?.message || 'Failed to change competition status.');
      }
    } catch (err) {
      alert(err.message || 'Network error updating status.');
    }
  };

  // --- QUESTION BANK HANDLERS ---
  const openCreateQuestionModal = () => {
    if (!selectedCompForQuestions) {
      alert(t.selectCompetitionToViewQuestions);
      return;
    }
    setEditingQuestionId(null);
    setQuestionFormData({
      competitionId: selectedCompForQuestions,
      prompt: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctOption: 'A',
      marks: 1,
      negativeMarks: 0,
      explanation: '',
      subject: 'General Knowledge',
      topic: 'Science & Society',
      classOrGrade: 'Class 9'
    });
    setQuestionModalError(null);
    setShowQuestionModal(true);
  };

  const openEditQuestionModal = (q) => {
    setEditingQuestionId(q.id);
    const optObj = {};
    if (Array.isArray(q.options)) {
      q.options.forEach((o) => {
        const k = o.key || o.label;
        if (k) optObj[k] = o.text;
      });
    }
    setQuestionFormData({
      competitionId: q.competitionId || selectedCompForQuestions,
      prompt: q.prompt || '',
      optionA: optObj['A'] || '',
      optionB: optObj['B'] || '',
      optionC: optObj['C'] || '',
      optionD: optObj['D'] || '',
      correctOption: q.correctOption || 'A',
      marks: q.marks || 1,
      negativeMarks: q.negativeMarks || 0,
      explanation: q.explanation || '',
      subject: q.subject || 'General Knowledge',
      topic: q.topic || '',
      classOrGrade: q.classOrGrade || 'Class 9'
    });
    setQuestionModalError(null);
    setShowQuestionModal(true);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    setQuestionSubmitting(true);
    setQuestionModalError(null);

    const payload = {
      prompt: questionFormData.prompt.trim(),
      options: [
        { key: 'A', label: 'A', text: questionFormData.optionA.trim() },
        { key: 'B', label: 'B', text: questionFormData.optionB.trim() },
        { key: 'C', label: 'C', text: questionFormData.optionC.trim() },
        { key: 'D', label: 'D', text: questionFormData.optionD.trim() }
      ],
      correctOption: questionFormData.correctOption,
      marks: Number(questionFormData.marks),
      negativeMarks: Number(questionFormData.negativeMarks),
      explanation: questionFormData.explanation?.trim() || undefined,
      subject: questionFormData.subject.trim(),
      topic: questionFormData.topic.trim(),
      classOrGrade: questionFormData.classOrGrade.trim()
    };

    try {
      const url = editingQuestionId
        ? `${API_BASE_URL}/admin/questions/${editingQuestionId}`
        : `${API_BASE_URL}/admin/competitions/${selectedCompForQuestions}/questions`;
      const method = editingQuestionId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getMutationHeaders(),
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowQuestionModal(false);
        setQuestionSuccess(editingQuestionId ? t.questionUpdatedSuccess : t.questionCreatedSuccess);
        setTimeout(() => setQuestionSuccess(null), 3500);
        await fetchQuestions(selectedCompForQuestions);
        await fetchCompetitions(); // update question counts
      } else {
        setQuestionModalError(data.error?.message || (data.error?.details && data.error.details.join(', ')) || 'Failed to save question.');
      }
    } catch (err) {
      setQuestionModalError(err.message || 'Network error.');
    } finally {
      setQuestionSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm(t.confirmDeleteQuestion)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/questions/${questionId}`, {
        method: 'DELETE',
        headers: getMutationHeaders(),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setQuestionSuccess(t.questionDeletedSuccess);
        setTimeout(() => setQuestionSuccess(null), 3500);
        await fetchQuestions(selectedCompForQuestions);
        await fetchCompetitions();
      } else {
        alert(data.error?.message || 'Failed to delete question.');
      }
    } catch (err) {
      alert(err.message || 'Network error deleting question.');
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'PUBLISHED') {
      return <span style={{ background: '#DCFCE7', color: '#166534', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>● {t.statusPublished}</span>;
    }
    if (s === 'CLOSED') {
      return <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>● {t.statusClosed}</span>;
    }
    if (s === 'ARCHIVED') {
      return <span style={{ background: '#F1F5F9', color: '#475569', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>● {t.statusArchived}</span>;
    }
    return <span style={{ background: '#FEF3C7', color: '#92400E', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>● {t.statusDraft}</span>;
  };

  return (
    <div className="dashboard-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>
      {/* Admin Header */}
      <header style={{ background: '#0F172A', color: '#FFFFFF', position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid #334155' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: '#1E293B', border: '1px solid #475569', color: '#60A5FA', width: '38px', height: '38px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
              🔐
            </div>
            <div>
              <span style={{ fontSize: '1rem', fontWeight: 700, display: 'block', color: '#FFFFFF' }}>
                {t.systemTitle}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                {t.dashboardAdminTitle}
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav style={{ display: 'flex', gap: '0.5rem', background: '#1E293B', padding: '0.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              style={{
                background: activeTab === 'overview' ? '#3B82F6' : 'transparent',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              📊 {t.tabOverview}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('competitions')}
              style={{
                background: activeTab === 'competitions' ? '#3B82F6' : 'transparent',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              🏆 {t.tabCompetitions}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('questions')}
              style={{
                background: activeTab === 'questions' ? '#3B82F6' : 'transparent',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ❓ {t.tabQuestionBank}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('attempts');
                if (selectedCompForAttempts) fetchAttempts(selectedCompForAttempts);
              }}
              style={{
                background: activeTab === 'attempts' ? '#3B82F6' : 'transparent',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ⏱️ {t.tabAttempts}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('merit');
                if (selectedCompForMerit) fetchMerit(selectedCompForMerit);
              }}
              style={{
                background: activeTab === 'merit' ? '#3B82F6' : 'transparent',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ⚖️ {t.meritList}
            </button>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Language Switcher */}
            <div className="lang-switcher" role="group" aria-label={t.langSwitcherLabel} style={{ background: '#1E293B', borderColor: '#334155' }}>
              <button 
                type="button"
                className={`lang-option-btn ${lang === 'hi' ? 'active' : ''}`}
                onClick={() => setLang('hi')}
                style={{ color: lang === 'hi' ? '#FFFFFF' : '#94A3B8' }}
              >
                हिंदी
              </button>
              <button 
                type="button"
                className={`lang-option-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
                style={{ color: lang === 'en' ? '#FFFFFF' : '#94A3B8' }}
              >
                English
              </button>
            </div>

            {/* Logout Button */}
            <button 
              className="btn btn-outline btn-sm" 
              onClick={handleLogout}
              disabled={loggingOut}
              style={{ borderColor: '#DC2626', color: '#FCA5A5', background: 'rgba(220, 38, 38, 0.1)' }}
            >
              <span>🚪</span>
              <span>{loggingOut ? t.loggingOut : t.btnLogout}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container" style={{ padding: '2rem 1.25rem', flex: 1 }}>
        {/* Global Notifications */}
        {compSuccess && (
          <div style={{ background: '#DCFCE7', color: '#166534', padding: '0.85rem 1.25rem', borderRadius: '8px', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #86EFAC' }}>
            <span>✅</span>
            <span>{compSuccess}</span>
          </div>
        )}
        {questionSuccess && (
          <div style={{ background: '#DCFCE7', color: '#166534', padding: '0.85rem 1.25rem', borderRadius: '8px', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #86EFAC' }}>
            <span>✅</span>
            <span>{questionSuccess}</span>
          </div>
        )}

        {/* ================= TAB 1: OVERVIEW ================= */}
        {activeTab === 'overview' && (
          <div>
            {/* Banner */}
            <div style={{
              background: '#0F172A',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-card)',
              padding: '1.75rem 2rem',
              marginBottom: '2rem',
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              borderLeft: '6px solid #3B82F6'
            }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#1E293B', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: user?.role === 'committee_head' ? '#FDE047' : '#93C5FD', marginBottom: '0.5rem', fontWeight: 600 }}>
                  <span>{user?.role === 'committee_head' ? '👑' : '🛡️'}</span>
                  <span>{user?.role === 'committee_head' ? (lang === 'hi' ? 'समिति अध्यक्ष (Committee Head)' : 'Committee Head') : t.roleAdmin}</span>
                </div>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: '0 0 0.35rem 0' }}>
                  {t.welcomeUser}, {user?.fullName}!
                </h1>
                <p style={{ opacity: 0.8, fontSize: '0.875rem', margin: 0 }}>
                  {t.adminSecurityNotice}
                </p>
              </div>

              <div style={{ textAlign: 'right', background: 'rgba(255,255,255,0.06)', padding: '0.65rem 1.15rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#94A3B8' }}>{t.accountStatus}</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#4ADE80' }}>● {t.statusActive}</span>
              </div>
            </div>

            {/* Quick Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.25rem' }}>{lang === 'hi' ? 'कुल प्रतियोगिताएं' : 'Total Competitions'}</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1E40AF' }}>{competitions.length}</span>
              </div>
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.25rem' }}>{lang === 'hi' ? 'सक्रिय / प्रकाशित' : 'Published Active'}</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16A34A' }}>
                  {competitions.filter((c) => c.status === 'PUBLISHED').length}
                </span>
              </div>
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.25rem' }}>{lang === 'hi' ? 'ड्राफ्ट प्रतियोगिताएं' : 'Draft Competitions'}</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#D97706' }}>
                  {competitions.filter((c) => c.status === 'DRAFT').length}
                </span>
              </div>
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.25rem' }}>{lang === 'hi' ? 'कुल प्रश्न (प्रतियोगितावार)' : 'Questions in Bank'}</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#7C3AED' }}>
                  {competitions.reduce((acc, c) => acc + (c.questionCount || 0), 0)}
                </span>
              </div>
            </div>

            {/* Profile Card & Navigation Shortcuts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>📋</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t.profileCardTitle}</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-muted)' }}>{lang === 'hi' ? 'अधिकारी का नाम' : 'Admin Name'}:</span>
                    <span style={{ fontWeight: 600 }}>{user?.fullName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-muted)' }}>{t.mobileLabel}:</span>
                    <span style={{ fontWeight: 600 }}>{user?.mobileNormalized}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-muted)' }}>{t.designationLabel}:</span>
                    <span style={{ fontWeight: 600 }}>{user?.classOrGrade}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-muted)' }}>{t.schoolLabel}:</span>
                    <span style={{ fontWeight: 600 }}>{user?.school}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Card */}
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>⚡</span>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{lang === 'hi' ? 'त्वरित प्रबंधन कार्य' : 'Quick Admin Actions'}</h3>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '1.25rem' }}>
                    {lang === 'hi'
                      ? 'नई परीक्षा प्रतियोगिताएं जोड़ें, तिथियां निर्धारित करें अथवा प्रश्न बैंक में नए बहुविकल्पीय प्रश्न दर्ज करें।'
                      : 'Create and schedule new competitions, configure examination modes, or manage MCQs in the Question Bank.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => { setActiveTab('competitions'); openCreateCompModal(); }}
                  >
                    {t.createCompetitionBtn}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setActiveTab('questions')}
                  >
                    ❓ {t.tabQuestionBank}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: COMPETITION MANAGEMENT ================= */}
        {activeTab === 'competitions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.25rem 0' }}>{t.tabCompetitions}</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0 }}>
                  {lang === 'hi' ? 'प्रतियोगिता का निर्माण, संपादन, स्थिति परिवर्तन (ड्राफ्ट, प्रकाशित, बंद) करें।' : 'Create, edit, publish, close, or archive competitions.'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={openCreateCompModal}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>➕</span>
                <span>{t.createCompetitionBtn}</span>
              </button>
            </div>

            {compError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem' }}>
                {compError}
              </div>
            )}

            {loadingCompetitions ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <span style={{ fontSize: '1.5rem' }}>⏳</span>
                <p style={{ color: 'var(--color-muted)' }}>{t.connecting}</p>
              </div>
            ) : competitions.length === 0 ? (
              <div style={{ background: '#FFFFFF', border: '1px dashed var(--color-border)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🏆</span>
                <h4 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{t.noCompetitionsFound}</h4>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                  {lang === 'hi' ? 'शुरुआत करने के लिए ऊपर दिए गए बटन से नई प्रतियोगिता बनाएं।' : 'Create your first competition to get started.'}
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={openCreateCompModal}>
                  {t.createCompetitionBtn}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {competitions.map((comp) => (
                  <div key={comp.id} className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem' }}>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{comp.title}</h3>
                          {getStatusBadge(comp.status)}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontFamily: 'monospace' }}>
                          slug: {comp.slug}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => openEditCompModal(comp)}
                        >
                          ✏️ {t.editCompetitionBtn}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ borderColor: '#818CF8', color: '#4F46E5' }}
                          onClick={() => {
                            setSelectedCompForQuestions(comp.id);
                            setActiveTab('questions');
                          }}
                        >
                          ❓ {t.manageQuestionsBtn} ({comp.questionCount || 0})
                        </button>

                        {/* Status Transition buttons */}
                        {comp.status === 'DRAFT' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ background: '#16A34A', borderColor: '#16A34A' }}
                            onClick={() => handleStatusChange(comp.id, 'PUBLISHED')}
                          >
                            📢 {t.publishBtn}
                          </button>
                        )}
                        {comp.status === 'PUBLISHED' && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ borderColor: '#EA580C', color: '#EA580C' }}
                            onClick={() => handleStatusChange(comp.id, 'CLOSED')}
                          >
                            🔒 {t.closeBtn}
                          </button>
                        )}
                        {comp.status === 'CLOSED' && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ borderColor: '#64748B', color: '#64748B' }}
                            onClick={() => handleStatusChange(comp.id, 'ARCHIVED')}
                          >
                            📦 {t.archiveBtn}
                          </button>
                        )}
                      </div>
                    </div>

                    <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
                      {comp.description}
                    </p>

                    {/* Metadata Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: '#F8FAFC', padding: '1rem', borderRadius: '8px', fontSize: '0.825rem' }}>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.examDateLabel}:</span>
                        <strong>{comp.examDate ? comp.examDate.split('T')[0] : 'N/A'}</strong> ({comp.startTime} - {comp.endTime})
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.durationLabel} &amp; {t.confirmedModeLabel}:</span>
                        <strong>{comp.durationMinutes} {lang === 'hi' ? 'मिनट' : 'mins'}</strong> &bull; {comp.mode}
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.eligibleClassesLabel}:</span>
                        <strong>{Array.isArray(comp.eligibleClasses) ? comp.eligibleClasses.join(', ') : comp.eligibleClasses}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{t.marksLabel}:</span>
                        <strong>{comp.totalMarks} {lang === 'hi' ? 'अंक' : 'marks'}</strong> ({comp.marksPerQuestion}/Q) {comp.negativeMarking?.enabled ? `(Neg: -${comp.negativeMarking.deduction})` : ''}
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-muted)', display: 'block' }}>{lang === 'hi' ? 'पंजीकृत छात्र' : 'Registrations'}:</span>
                        <strong style={{ color: '#2563EB' }}>{comp.registrationCount || 0} {lang === 'hi' ? 'छात्र' : 'students'}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: QUESTION BANK ================= */}
        {activeTab === 'questions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.25rem 0' }}>{t.tabQuestionBank}</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0 }}>
                  {lang === 'hi' ? 'प्रत्येक प्रतियोगिता हेतु 4-विकल्पीय बहुविकल्पीय प्रश्न, सही उत्तर एवं अंक योजना प्रबंधित करें।' : 'Manage 4-option MCQs, answer keys, marks, and explanations for competitions.'}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* Competition Selector Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor="compSelect" style={{ fontSize: '0.825rem', fontWeight: 600 }}>
                    {lang === 'hi' ? 'प्रतियोगिता:' : 'Competition:'}
                  </label>
                  <select
                    id="compSelect"
                    value={selectedCompForQuestions}
                    onChange={(e) => setSelectedCompForQuestions(e.target.value)}
                    style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem', background: '#FFFFFF' }}
                  >
                    {competitions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={openCreateQuestionModal}
                  disabled={!selectedCompForQuestions}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <span>➕</span>
                  <span>{t.addQuestionBtn}</span>
                </button>
              </div>
            </div>

            {questionError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem' }}>
                {questionError}
              </div>
            )}

            {loadingQuestions ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <span style={{ fontSize: '1.5rem' }}>⏳</span>
                <p style={{ color: 'var(--color-muted)' }}>{t.connecting}</p>
              </div>
            ) : questions.length === 0 ? (
              <div style={{ background: '#FFFFFF', border: '1px dashed var(--color-border)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>❓</span>
                <h4 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{t.noQuestionsFound}</h4>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                  {lang === 'hi' ? 'इस प्रतियोगिता में प्रश्न जोड़ने हेतु ऊपर दिए गए बटन का उपयोग करें।' : 'Click the button above to add the first question to this competition.'}
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={openCreateQuestionModal} disabled={!selectedCompForQuestions}>
                  {t.addQuestionBtn}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                  {t.totalQuestionsCount}: {questions.length}
                </div>
                {questions.map((q, idx) => (
                  <div key={q.id} className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                          Q#{idx + 1}
                        </span>
                        <span style={{ background: '#F1F5F9', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {q.subject}
                        </span>
                        {q.topic && (
                          <span style={{ background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                            {q.topic}
                          </span>
                        )}
                        <span style={{ background: '#ECFDF5', color: '#047857', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          +{q.marks} {lang === 'hi' ? 'अंक' : 'mark(s)'} {q.negativeMarks > 0 ? `(-${q.negativeMarks})` : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => openEditQuestionModal(q)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          ✏️ {t.editQuestionBtn}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDeleteQuestion(q.id)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#FCA5A5', color: '#DC2626' }}
                        >
                          🗑️ {t.deleteQuestionBtn}
                        </button>
                      </div>
                    </div>

                    <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.85rem' }}>
                      {q.prompt}
                    </p>

                    {/* Options Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {q.options?.map((opt) => {
                        const optKey = opt.key || opt.label;
                        const isCorrect = q.correctOption === optKey;
                        return (
                          <div
                            key={optKey}
                            style={{
                              background: isCorrect ? '#DCFCE7' : '#F8FAFC',
                              border: isCorrect ? '2px solid #22C55E' : '1px solid var(--color-border)',
                              borderRadius: '6px',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.85rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}
                          >
                            <strong style={{ color: isCorrect ? '#15803D' : '#475569' }}>
                              {optKey}.
                            </strong>
                            <span style={{ color: isCorrect ? '#166534' : 'var(--color-text)', fontWeight: isCorrect ? 600 : 400 }}>
                              {opt.text}
                            </span>
                            {isCorrect && (
                              <span style={{ marginLeft: 'auto', color: '#16A34A', fontWeight: 700 }}>
                                ✓ {t.correctAnswer}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#92400E' }}>
                        <strong>{t.explanation}:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: ATTEMPT MONITORING (Phase 4) ================= */}
        {activeTab === 'attempts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 0.25rem 0' }}>
                  ⏱️ {t.attemptMonitoringTitle}
                </h2>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', margin: 0 }}>
                  {lang === 'hi' ? 'छात्रों के ऑनलाइन परीक्षा प्रयासों, उत्तरों एवं समय का वास्तविक समय में निरीक्षण करें।' : 'Monitor student online exam attempts, answers, and timestamps in real time.'}
                </p>
              </div>

              {/* Competition Selector & Refresh Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <select
                  value={selectedCompForAttempts}
                  onChange={(e) => setSelectedCompForAttempts(e.target.value)}
                  style={{
                    padding: '0.55rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.875rem',
                    background: '#FFFFFF',
                    fontWeight: 600,
                    maxWidth: '280px'
                  }}
                >
                  {competitions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.status})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => selectedCompForAttempts && fetchAttempts(selectedCompForAttempts)}
                  disabled={loadingAttempts}
                  style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  🔄 {t.refreshAttempts}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {attemptsError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {attemptsError}
              </div>
            )}

            {/* Metric Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  {t.totalAttemptsCount}
                </span>
                <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#1E293B' }}>
                  {attempts.length}
                </span>
              </div>

              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  {t.inProgressCount}
                </span>
                <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#2563EB' }}>
                  {attempts.filter((a) => a.status === 'IN_PROGRESS').length}
                </span>
              </div>

              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  {t.submittedCount}
                </span>
                <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#16A34A' }}>
                  {attempts.filter((a) => a.status === 'SUBMITTED').length}
                </span>
              </div>

              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  {t.autoSubmittedCount}
                </span>
                <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#D97706' }}>
                  {attempts.filter((a) => a.status === 'AUTO_SUBMITTED').length}
                </span>
              </div>
            </div>

            {/* Attempts Table */}
            {loadingAttempts ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: '#FFFFFF', borderRadius: 'var(--radius-card)' }}>
                <span>⏳ {lang === 'hi' ? 'परीक्षा प्रयास लोड हो रहे हैं...' : 'Loading attempt logs...'}</span>
              </div>
            ) : attempts.length === 0 ? (
              <div style={{
                background: '#FFFFFF',
                border: '1px dashed var(--color-border)',
                borderRadius: 'var(--radius-card)',
                padding: '3rem',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.95rem', margin: 0 }}>
                  {t.noAttemptsFound}
                </p>
              </div>
            ) : (
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                overflowX: 'auto',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>{t.thRollNumber}</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>{t.thStudentName}</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>{t.thMobile}</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>{t.thStatus}</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>{t.thAnsweredQuestions}</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>{t.thStartedAt}</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>{t.thSubmittedAt}</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>{t.thLastSaved}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((att) => {
                      const statusColor = 
                        att.status === 'SUBMITTED' ? { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' } :
                        att.status === 'AUTO_SUBMITTED' ? { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' } :
                        { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' };

                      const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString() : '—';

                      return (
                        <tr key={att.attemptId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#1E3A8A' }}>
                            {att.rollNumber}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                            {att.studentName}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748B' }}>
                            {att.mobile}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{
                              background: statusColor.bg,
                              color: statusColor.text,
                              border: `1px solid ${statusColor.border}`,
                              padding: '0.2rem 0.6rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'inline-block'
                            }}>
                              ● {att.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                            {att.answersCount} / {att.totalQuestions}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748B' }}>
                            {formatTime(att.startedAt)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748B' }}>
                            {formatTime(att.submittedAt)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748B' }}>
                            {formatTime(att.lastSavedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: CENTRAL SCORING & MERIT LIST (PHASE 5) ================= */}
        {activeTab === 'merit' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#0F172A' }}>
                  ⚖️ {t.internalMeritList}
                </h2>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', margin: 0 }}>
                  {lang === 'hi' 
                    ? 'केंद्रीय स्कोरिंग, ऋणात्मक अंकन, टाई-ब्रेकिंग एवं समिति अध्यक्ष अनुमोदन गेटवे' 
                    : 'Central scoring, negative marking, tie-breaking and Committee Head approval gateway'}
                </p>
              </div>

              {/* Competition Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {t.selectCompetition}:
                </label>
                <select
                  value={selectedCompForMerit}
                  onChange={(e) => setSelectedCompForMerit(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.85rem',
                    background: '#FFFFFF',
                    fontWeight: 600,
                    minWidth: '220px'
                  }}
                >
                  {competitions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.resultStatus || 'NOT_EVALUATED'})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => fetchMerit(selectedCompForMerit)}
                  className="btn btn-outline btn-sm"
                  title="Refresh Merit List"
                >
                  🔄
                </button>
              </div>
            </div>

            {/* Success and Error Alerts */}
            {meritSuccess && (
              <div style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>✓ {meritSuccess}</span>
                <button type="button" onClick={() => setMeritSuccess(null)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
            )}
            {meritError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠️ {meritError}</span>
                <button type="button" onClick={() => setMeritError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
            )}

            {/* Status & Governance Card */}
            {meritData.competition && (
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
                      {meritData.competition.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--color-muted)' }}>{t.scoringVersion}: <strong>v{meritData.competition.scoringVersion || 1}</strong></span>
                      <span>&bull;</span>
                      <span style={{ color: 'var(--color-muted)' }}>
                        {t.publicMeritList}: 
                        <strong style={{ color: meritData.competition.isPublicMeritListEnabled ? '#16A34A' : '#64748B', marginLeft: '0.25rem' }}>
                          {meritData.competition.isPublicMeritListEnabled ? t.publicMeritListEnabled : t.publicMeritListDisabled}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Result Status Badge */}
                  <div>
                    {(() => {
                      const s = meritData.competition.resultStatus || 'NOT_EVALUATED';
                      let bg = '#FEF3C7';
                      let color = '#92400E';
                      let label = t.resultStatusNotEvaluated;
                      if (s === 'EVALUATED') { bg = '#EFF6FF'; color = '#1E40AF'; label = t.resultStatusEvaluated; }
                      else if (s === 'PENDING_APPROVAL') { bg = '#F3E8FF'; color = '#6B21A8'; label = t.resultStatusPendingApproval; }
                      else if (s === 'APPROVED') { bg = '#E0E7FF'; color = '#3730A3'; label = t.resultStatusApproved; }
                      else if (s === 'PUBLISHED') { bg = '#DCFCE7'; color = '#166534'; label = t.resultStatusPublished; }
                      else if (s === 'REVISION_REQUIRED') { bg = '#FEE2E2'; color = '#991B1B'; label = t.resultStatusRevisionRequired; }

                      return (
                        <div style={{ background: bg, color: color, padding: '0.4rem 0.85rem', borderRadius: '8px', fontWeight: 800, fontSize: '0.875rem', border: `1px solid ${color}33`, textAlign: 'center' }}>
                          ● {label}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Tie-breaker Rules & Standard Ranking Explanation */}
                <div style={{ background: '#F8FAFC', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.25rem', fontSize: '0.825rem' }}>
                  <div style={{ fontWeight: 700, color: '#334155', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>⚖️</span>
                    <span>{t.tieBreakerRules}:</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', color: '#475569', marginBottom: '0.35rem' }}>
                    <span>{t.ruleFinalScore}</span>
                    <span>&rarr;</span>
                    <span>{t.ruleCorrect}</span>
                    <span>&rarr;</span>
                    <span>{t.ruleIncorrect}</span>
                    <span>&rarr;</span>
                    <span>{t.ruleTime}</span>
                  </div>
                  <div style={{ color: '#0369A1', fontSize: '0.775rem' }}>
                    ℹ️ {t.standardRankingNote}
                  </div>
                </div>

                {/* Workflow Governance Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                  {/* Evaluation / Re-Evaluation */}
                  {meritData.competition.resultStatus !== 'PUBLISHED' && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        if (meritData.competition.resultStatus === 'EVALUATED') {
                          setReasonModal({
                            open: true,
                            action: 'RE_EVALUATE',
                            title: t.btnReEvaluate,
                            reason: ''
                          });
                        } else {
                          handleEvaluate(selectedCompForMerit, false, 'Standard initial evaluation');
                        }
                      }}
                      disabled={loadingMerit}
                    >
                      🚀 {meritData.competition.resultStatus === 'EVALUATED' ? t.btnReEvaluate : t.btnEvaluate}
                    </button>
                  )}

                  {/* Request Approval (Admin or Head) */}
                  {(meritData.competition.resultStatus === 'EVALUATED' || meritData.competition.resultStatus === 'REVISION_REQUIRED') && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => handleRequestApproval(selectedCompForMerit)}
                      disabled={loadingMerit || meritData.meritList.length === 0}
                      style={{ borderColor: '#6B21A8', color: '#6B21A8' }}
                    >
                      📤 {t.btnRequestApproval}
                    </button>
                  )}

                  {/* COMMITTEE HEAD ONLY ACTIONS */}
                  {user?.role === 'committee_head' ? (
                    <>
                      {/* Approve */}
                      {(meritData.competition.resultStatus === 'PENDING_APPROVAL' || meritData.competition.resultStatus === 'EVALUATED') && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => handleApprove(selectedCompForMerit)}
                          disabled={loadingMerit || meritData.meritList.length === 0}
                          style={{ background: '#16A34A', color: '#FFFFFF', border: 'none' }}
                        >
                          ✓ {t.btnApprove}
                        </button>
                      )}

                      {/* Reject / Request Revision */}
                      {meritData.competition.resultStatus === 'PENDING_APPROVAL' && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setReasonModal({
                            open: true,
                            action: 'REJECT',
                            title: t.btnRejectRevision,
                            reason: ''
                          })}
                          disabled={loadingMerit}
                          style={{ background: '#EF4444', color: '#FFFFFF', border: 'none' }}
                        >
                          ✕ {t.btnRejectRevision}
                        </button>
                      )}

                      {/* Publish */}
                      {meritData.competition.resultStatus === 'APPROVED' && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => handlePublish(selectedCompForMerit, meritData.competition.isPublicMeritListEnabled)}
                          disabled={loadingMerit}
                          style={{ background: '#059669', color: '#FFFFFF', border: 'none', fontWeight: 700 }}
                        >
                          📢 {t.btnPublishResults}
                        </button>
                      )}

                      {/* Unpublish / Recall (when published) */}
                      {meritData.competition.resultStatus === 'PUBLISHED' && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setReasonModal({
                            open: true,
                            action: 'UNPUBLISH',
                            title: t.btnUnpublishResults,
                            reason: ''
                          })}
                          disabled={loadingMerit}
                          style={{ borderColor: '#DC2626', color: '#DC2626' }}
                        >
                          ⚠️ {t.btnUnpublishResults}
                        </button>
                      )}

                      {/* Toggle Public Merit List */}
                      {meritData.competition.resultStatus === 'PUBLISHED' && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleTogglePublic(selectedCompForMerit, !meritData.competition.isPublicMeritListEnabled)}
                          disabled={loadingMerit}
                        >
                          🌐 {meritData.competition.isPublicMeritListEnabled ? t.publicMeritListEnabled : t.publicMeritListDisabled} ({t.togglePublicMeritList})
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic' }}>
                      🔒 {lang === 'hi' ? 'अंतिम अनुमोदन एवं प्रकाशन केवल समिति अध्यक्ष द्वारा अधिकृत है।' : 'Formal approval and publication actions require Committee Head credentials.'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Internal Merit List Table */}
            <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>🏆</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                    {t.meritList} ({meritData.meritList.length} {lang === 'hi' ? 'परीक्षार्थी' : 'candidates'})
                  </h3>
                </div>

                <input
                  type="text"
                  placeholder={lang === 'hi' ? 'नाम या रोल नंबर से खोजें...' : 'Search by student name or roll number...'}
                  value={meritSearch}
                  onChange={(e) => setMeritSearch(e.target.value)}
                  style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.825rem', width: '260px' }}
                />
              </div>

              {loadingMerit ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-muted)' }}>
                  ⏳ {t.connecting}
                </div>
              ) : meritData.meritList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-muted)', background: '#F8FAFC', borderRadius: '8px' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    {lang === 'hi' ? 'इस प्रतियोगिता हेतु अभी कोई मूल्यांकित परिणाम उपलब्ध नहीं है।' : 'No evaluated results found for this competition.'}
                  </p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.825rem' }}>
                    {lang === 'hi' ? 'मूल्यांकन प्रारंभ करने के लिए ऊपर "परीक्षा मूल्यांकन प्रारंभ करें" बटन दबाएं।' : 'Click "Evaluate Exam Attempts" above to process submitted attempts.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#F1F5F9', borderBottom: '2px solid var(--color-border)', color: '#475569' }}>
                        <th style={{ padding: '0.65rem 0.85rem' }}>{t.rank}</th>
                        <th style={{ padding: '0.65rem 0.85rem' }}>{t.rollNumber}</th>
                        <th style={{ padding: '0.65rem 0.85rem' }}>{t.candidateName}</th>
                        <th style={{ padding: '0.65rem 0.85rem' }}>{t.school}</th>
                        <th style={{ padding: '0.65rem 0.85rem' }}>{t.classGrade}</th>
                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>{t.correctAnswers}</th>
                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>{t.incorrectAnswers}</th>
                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>{t.unanswered}</th>
                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>{t.finalScore} / {t.maxMarks}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meritData.meritList
                        .filter((r) => {
                          if (!meritSearch) return true;
                          const q = meritSearch.toLowerCase();
                          return (r.studentName && r.studentName.toLowerCase().includes(q)) ||
                                 (r.rollNumber && r.rollNumber.toLowerCase().includes(q));
                        })
                        .map((r, idx) => {
                          const isTop3 = r.rank <= 3;
                          let rankBadgeBg = '#F1F5F9';
                          let rankBadgeColor = '#475569';
                          if (r.rank === 1) { rankBadgeBg = '#FEF3C7'; rankBadgeColor = '#B45309'; }
                          else if (r.rank === 2) { rankBadgeBg = '#F1F5F9'; rankBadgeColor = '#334155'; }
                          else if (r.rank === 3) { rankBadgeBg = '#FFEDD5'; rankBadgeColor = '#C2410C'; }

                          return (
                            <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--color-border)', background: isTop3 ? '#FAFAFA' : '#FFFFFF' }}>
                              <td style={{ padding: '0.65rem 0.85rem', fontWeight: 800 }}>
                                <span style={{ background: rankBadgeBg, color: rankBadgeColor, padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.8rem', display: 'inline-block' }}>
                                  #{r.rank}
                                </span>
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: '#1E3A8A' }}>
                                {r.rollNumber}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>
                                {r.studentName}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', color: '#64748B' }}>
                                {r.school || '—'}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', color: '#64748B' }}>
                                {r.classOrGrade || '—'}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#16A34A', fontWeight: 600 }}>
                                {r.correctAnswers}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#DC2626', fontWeight: 600 }}>
                                {r.incorrectAnswers}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#94A3B8' }}>
                                {r.unansweredQuestions}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                <span style={{ fontSize: '0.95rem' }}>{r.finalScore}</span>
                                <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}> / {r.maximumMarks}</span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Audit Trail Section */}
            {meritData.auditLogs?.length > 0 && (
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>📜</span>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                    {t.auditHistory} ({meritData.auditLogs.length} {lang === 'hi' ? 'प्रविष्टियां' : 'records'})
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto' }}>
                  {meritData.auditLogs.map((log) => (
                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#F8FAFC', borderRadius: '6px', fontSize: '0.8rem', borderLeft: '3px solid #3B82F6' }}>
                      <div>
                        <strong>{log.action}</strong>
                        <span style={{ margin: '0 0.5rem', color: 'var(--color-muted)' }}>&bull;</span>
                        <span>{log.actorName} ({log.actorRole})</span>
                        {log.reason && (
                          <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                            {log.reason}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', color: '#94A3B8', fontSize: '0.725rem' }}>
                        <div>{new Date(log.timestamp).toLocaleString()}</div>
                        <div>v{log.scoringVersion || 1}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ================= REASON PROMPT MODAL ================= */}
      {reasonModal.open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div className="card" style={{ background: '#FFFFFF', borderRadius: 'var(--radius-card)', width: '100%', maxWidth: '480px', padding: '1.5rem', boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: '#0F172A' }}>
              {reasonModal.title}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '1rem' }}>
              {t.reEvaluationReason}:
            </p>
            <textarea
              rows={3}
              value={reasonModal.reason}
              onChange={(e) => setReasonModal({ ...reasonModal, reason: e.target.value })}
              placeholder={t.enterReason}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem', marginBottom: '1rem', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setReasonModal({ open: false, action: '', title: '', reason: '' })}
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!reasonModal.reason || reasonModal.reason.trim().length < 3}
                onClick={async () => {
                  const action = reasonModal.action;
                  const reason = reasonModal.reason.trim();
                  setReasonModal({ open: false, action: '', title: '', reason: '' });
                  if (action === 'RE_EVALUATE') {
                    await handleEvaluate(selectedCompForMerit, true, reason);
                  } else if (action === 'REJECT') {
                    await handleReject(selectedCompForMerit, reason);
                  } else if (action === 'UNPUBLISH') {
                    await handleUnpublish(selectedCompForMerit, reason);
                  }
                }}
              >
                {t.modalClose}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT COMPETITION ================= */}
      {showCompModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', overflowY: 'auto' }}>
          <div className="card" style={{ background: '#FFFFFF', borderRadius: 'var(--radius-card)', width: '100%', maxWidth: '650px', padding: '1.75rem', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                {editingCompId ? t.editCompetitionBtn : t.createCompetitionBtn}
              </h3>
              <button
                type="button"
                onClick={() => setShowCompModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                ✕
              </button>
            </div>

            {compModalError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {compModalError}
              </div>
            )}

            <form onSubmit={handleSaveCompetition} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  {t.competitionTitle} *
                </label>
                <input
                  type="text"
                  required
                  value={compFormData.title}
                  onChange={(e) => setCompFormData({ ...compFormData, title: e.target.value })}
                  placeholder={lang === 'hi' ? 'उदा. वार्षिक ग्रामीण प्रतिभा खोज 2026' : 'e.g. Annual Talent Search Exam 2026'}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  {t.competitionDescription} *
                </label>
                <textarea
                  required
                  rows={3}
                  value={compFormData.description}
                  onChange={(e) => setCompFormData({ ...compFormData, description: e.target.value })}
                  placeholder={lang === 'hi' ? 'प्रतियोगिता का संक्षिप्त विवरण, उद्देश्य एवं नियम...' : 'Brief summary, scope, and objectives...'}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.competitionExamDate} *
                  </label>
                  <input
                    type="date"
                    required
                    value={compFormData.examDate}
                    onChange={(e) => setCompFormData({ ...compFormData, examDate: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.competitionStartTime} *
                  </label>
                  <input
                    type="time"
                    required
                    value={compFormData.startTime}
                    onChange={(e) => setCompFormData({ ...compFormData, startTime: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.competitionEndTime} *
                  </label>
                  <input
                    type="time"
                    required
                    value={compFormData.endTime}
                    onChange={(e) => setCompFormData({ ...compFormData, endTime: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.competitionDuration} *
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={360}
                    required
                    value={compFormData.durationMinutes}
                    onChange={(e) => setCompFormData({ ...compFormData, durationMinutes: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.competitionMode} *
                  </label>
                  <select
                    value={compFormData.mode}
                    onChange={(e) => setCompFormData({ ...compFormData, mode: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem', background: '#FFFFFF' }}
                  >
                    <option value="BOTH">{t.modeBoth}</option>
                    <option value="ONLINE_MCQ">{t.modeOnline}</option>
                    <option value="OMR">{t.modeOmr}</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.totalMarks} *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={compFormData.totalMarks}
                    onChange={(e) => setCompFormData({ ...compFormData, totalMarks: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  {t.eligibleClasses} *
                </label>
                <input
                  type="text"
                  required
                  value={compFormData.eligibleClasses}
                  onChange={(e) => setCompFormData({ ...compFormData, eligibleClasses: e.target.value })}
                  placeholder="Class 9, Class 10, Class 11, Class 12"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                />
              </div>

              {/* Negative marking & scoring */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: '#F8FAFC', padding: '0.75rem', borderRadius: '6px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={compFormData.negativeMarkingEnabled}
                    onChange={(e) => setCompFormData({ ...compFormData, negativeMarkingEnabled: e.target.checked })}
                  />
                  <span>{t.negativeMarking}</span>
                </label>

                {compFormData.negativeMarkingEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                      {t.negativeDeduction}:
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      max="5"
                      value={compFormData.negativeDeduction}
                      onChange={(e) => setCompFormData({ ...compFormData, negativeDeduction: e.target.value })}
                      style={{ width: '80px', padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.regOpenDate}
                  </label>
                  <input
                    type="datetime-local"
                    value={compFormData.registrationOpensAt}
                    onChange={(e) => setCompFormData({ ...compFormData, registrationOpensAt: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.regCloseDate}
                  </label>
                  <input
                    type="datetime-local"
                    value={compFormData.registrationClosesAt}
                    onChange={(e) => setCompFormData({ ...compFormData, registrationClosesAt: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowCompModal(false)}
                  disabled={compSubmitting}
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={compSubmitting}
                >
                  {compSubmitting ? '...' : t.saveCompetition}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT QUESTION ================= */}
      {showQuestionModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem', overflowY: 'auto' }}>
          <div className="card" style={{ background: '#FFFFFF', borderRadius: 'var(--radius-card)', width: '100%', maxWidth: '650px', padding: '1.75rem', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                {editingQuestionId ? t.editQuestionBtn : t.addQuestionBtn}
              </h3>
              <button
                type="button"
                onClick={() => setShowQuestionModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                ✕
              </button>
            </div>

            {questionModalError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {questionModalError}
              </div>
            )}

            <form onSubmit={handleSaveQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.subject} *
                  </label>
                  <input
                    type="text"
                    required
                    value={questionFormData.subject}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, subject: e.target.value })}
                    placeholder="Science / Math / GK"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.topic}
                  </label>
                  <input
                    type="text"
                    value={questionFormData.topic}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, topic: e.target.value })}
                    placeholder="Chapter / Topic"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.questionClass} *
                  </label>
                  <input
                    type="text"
                    required
                    value={questionFormData.classOrGrade}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, classOrGrade: e.target.value })}
                    placeholder="Class 9"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  {t.questionPrompt} *
                </label>
                <textarea
                  required
                  rows={3}
                  value={questionFormData.prompt}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, prompt: e.target.value })}
                  placeholder={lang === 'hi' ? 'प्रश्न का पूरा विवरण यहाँ लिखें...' : 'Enter full question statement...'}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* 4 Options */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.optionA} *
                  </label>
                  <input
                    type="text"
                    required
                    value={questionFormData.optionA}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, optionA: e.target.value })}
                    placeholder="Option A text"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.optionB} *
                  </label>
                  <input
                    type="text"
                    required
                    value={questionFormData.optionB}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, optionB: e.target.value })}
                    placeholder="Option B text"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.optionC} *
                  </label>
                  <input
                    type="text"
                    required
                    value={questionFormData.optionC}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, optionC: e.target.value })}
                    placeholder="Option C text"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.optionD} *
                  </label>
                  <input
                    type="text"
                    required
                    value={questionFormData.optionD}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, optionD: e.target.value })}
                    placeholder="Option D text"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Correct Option, Marks, Negative Marks */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', background: '#F8FAFC', padding: '0.75rem', borderRadius: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.correctAnswer} *
                  </label>
                  <select
                    value={questionFormData.correctOption}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, correctOption: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem', background: '#FFFFFF' }}
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.questionMarks} *
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    required
                    value={questionFormData.marks}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, marks: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {t.questionNegativeMarks}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={questionFormData.negativeMarks}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, negativeMarks: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  {t.explanation}
                </label>
                <textarea
                  rows={2}
                  value={questionFormData.explanation}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, explanation: e.target.value })}
                  placeholder={lang === 'hi' ? 'उत्तर का स्पष्टीकरण (वैकल्पिक)...' : 'Rationale/solution behind the correct option...'}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowQuestionModal(false)}
                  disabled={questionSubmitting}
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={questionSubmitting}
                >
                  {questionSubmitting ? '...' : t.saveQuestion}
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