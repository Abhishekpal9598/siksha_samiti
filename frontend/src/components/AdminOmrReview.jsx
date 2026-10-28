import React, { useState, useEffect } from 'react';

export default function AdminOmrReview({
  competitions,
  selectedCompId,
  onSelectCompetition,
  t,
  lang,
  getMutationHeaders,
  apiBaseUrl,
  user
}) {
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionsError, setSubmissionsError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [selectedSubId, setSelectedSubId] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Question Deck state
  const [questionFilter, setQuestionFilter] = useState('ALL'); // 'ALL' | 'NEEDS_REVIEW' | 'UNCONFIRMED' | 'CONFIRMED'
  const [draftAnswers, setDraftAnswers] = useState({}); // { [qNum]: { selectedOption, reason } }
  const [savingQuestion, setSavingQuestion] = useState({}); // { [qNum]: boolean }
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Finalize / Reopen modals
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [confirmRemainingClean, setConfirmRemainingClean] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // Zoom state for aligned image viewer
  const [imageZoom, setImageZoom] = useState(1.0);

  // 1. Fetch Submissions when competition changes
  const fetchSubmissions = async (compId) => {
    if (!compId) return;
    setLoadingSubmissions(true);
    setSubmissionsError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/competitions/${compId}/omr/submissions`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubmissions(data.data || []);
      } else {
        setSubmissionsError(data.error?.message || 'Failed to fetch OMR submissions.');
      }
    } catch (err) {
      setSubmissionsError(err.message || 'Network error fetching OMR submissions.');
    } finally {
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (selectedCompId) {
      fetchSubmissions(selectedCompId);
      setSelectedSubId(null);
      setSelectedSub(null);
    }
  }, [selectedCompId]);

  // 2. Fetch specific Submission detail
  const fetchSubmissionDetail = async (subId) => {
    if (!subId || !selectedCompId) return;
    setLoadingDetail(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/competitions/${selectedCompId}/omr/submissions/${subId}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedSub(data.data);
        // Initialize draft answers from existing confirmed answers or machine detections
        const drafts = {};
        if (data.data?.confirmedAnswers?.answers) {
          Object.entries(data.data.confirmedAnswers.answers).forEach(([q, ans]) => {
            drafts[q] = {
              selectedOption: ans.selectedOption,
              reason: ans.reason || ''
            };
          });
        }
        setDraftAnswers(drafts);
      } else {
        setActionError(data.error?.message || 'Failed to load submission detail.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error loading submission.');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (selectedSubId) {
      fetchSubmissionDetail(selectedSubId);
    }
  }, [selectedSubId]);

  // 3. Start Review
  const handleStartReview = async () => {
    if (!selectedSubId || !selectedCompId) return;
    setActionError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/competitions/${selectedCompId}/omr/submissions/${selectedSubId}/start-review`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedSub(data.data);
        await fetchSubmissions(selectedCompId);
      } else {
        setActionError(data.error?.message || 'Failed to start review.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error starting review.');
    }
  };

  // 4. Save Single Question Confirmation
  const handleSaveQuestion = async (qNum) => {
    const draft = draftAnswers[qNum];
    if (!draft || !draft.selectedOption) {
      setActionError(`Please select an answer option for Q${qNum}`);
      return;
    }

    const mach = selectedSub?.rawDetections?.answers?.find(a => a.questionNumber === qNum);
    const machOpt = mach?.detectedOption || (mach?.classification === 'BLANK' ? 'BLANK' : null);
    const isCorrected = draft.selectedOption !== machOpt;

    if (isCorrected && (!draft.reason || draft.reason.trim().length < 3)) {
      setActionError(`A descriptive reason (min 3 chars) is required when correcting Q${qNum}`);
      return;
    }

    setActionError(null);
    setSavingQuestion(prev => ({ ...prev, [qNum]: true }));

    try {
      const currentVersion = selectedSub?.confirmedAnswers?.version || 1;
      const res = await fetch(`${apiBaseUrl}/admin/competitions/${selectedCompId}/omr/submissions/${selectedSubId}/answers/${qNum}`, {
        method: 'PUT',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          selectedOption: draft.selectedOption,
          reason: draft.reason?.trim() || null,
          expectedVersion: currentVersion
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedSub(data.data);
        setActionSuccess(`Q${qNum} ${t.omrSuccessAnswerSaved || 'confirmed successfully.'}`);
        setTimeout(() => setActionSuccess(null), 3000);
        await fetchSubmissions(selectedCompId);
      } else {
        setActionError(data.error?.message || `Failed to confirm Q${qNum}`);
      }
    } catch (err) {
      setActionError(err.message || 'Network error saving question confirmation.');
    } finally {
      setSavingQuestion(prev => ({ ...prev, [qNum]: false }));
    }
  };

  // 5. Finalize Verification
  const handleFinalizeVerification = async () => {
    setActionError(null);
    setFinalizing(true);
    try {
      const currentVersion = selectedSub?.confirmedAnswers?.version || 1;
      const res = await fetch(`${apiBaseUrl}/admin/competitions/${selectedCompId}/omr/submissions/${selectedSubId}/finalize-verification`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          reviewNotes: reviewNotes.trim(),
          confirmRemainingClean,
          expectedVersion: currentVersion
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedSub(data.data);
        setShowFinalizeModal(false);
        setActionSuccess(t.omrSuccessFinalized || 'OMR verification successfully finalized.');
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchSubmissions(selectedCompId);
      } else {
        setActionError(data.error?.message || 'Finalization failed.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error finalizing verification.');
    } finally {
      setFinalizing(false);
    }
  };

  // 6. Reopen Verification
  const handleReopenVerification = async () => {
    if (!reopenReason || reopenReason.trim().length < 5) {
      setActionError('Reason for reopening must be at least 5 characters.');
      return;
    }

    setActionError(null);
    setReopening(true);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/competitions/${selectedCompId}/omr/submissions/${selectedSubId}/reopen-verification`, {
        method: 'POST',
        headers: getMutationHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          reason: reopenReason.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedSub(data.data);
        setShowReopenModal(false);
        setReopenReason('');
        setActionSuccess(t.omrSuccessReopened || 'OMR submission reopened.');
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchSubmissions(selectedCompId);
      } else {
        setActionError(data.error?.message || 'Failed to reopen submission.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error reopening submission.');
    } finally {
      setReopening(false);
    }
  };

  // Helper status badge renderer
  const renderStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    let bg = '#F1F5F9', color = '#475569', label = s;
    if (s === 'VERIFIED') { bg = '#DCFCE7'; color = '#166534'; label = t.filterVerified || 'VERIFIED'; }
    else if (s === 'PARTIALLY_VERIFIED') { bg = '#E0F2FE'; color = '#0369A1'; label = t.filterPartiallyVerified || 'PARTIAL'; }
    else if (s === 'IN_REVIEW') { bg = '#FEF3C7'; color = '#B45309'; label = t.filterInReview || 'IN REVIEW'; }
    else if (s === 'NEEDS_REVIEW') { bg = '#FEE2E2'; color = '#991B1B'; label = t.filterNeedsReview || 'NEEDS REVIEW'; }
    else if (s === 'REOPENED') { bg = '#F3E8FF'; color = '#6B21A8'; label = t.filterReopened || 'REOPENED'; }
    else if (s === 'PROCESSING') { bg = '#EFF6FF'; color = '#1D4ED8'; label = 'PROCESSING'; }

    return (
      <span style={{ background: bg, color, padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
        ● {label}
      </span>
    );
  };

  // Filter submissions
  const filteredSubmissions = submissions.filter(sub => {
    if (statusFilter === 'ALL') return true;
    return sub.status === statusFilter;
  });

  // Questions filtering & progress
  const totalQuestions = selectedSub?.rawDetections?.totalQuestions || 50;
  const questionsList = selectedSub?.rawDetections?.answers || [];
  const confirmedAnswersMap = selectedSub?.confirmedAnswers?.answers || {};

  const confirmedCount = Object.values(confirmedAnswersMap).filter(a => a?.isConfirmed).length;
  const progressPct = Math.round((confirmedCount / totalQuestions) * 100);

  const filteredQuestions = questionsList.filter(q => {
    const isConfirmed = confirmedAnswersMap[q.questionNumber]?.isConfirmed;
    if (questionFilter === 'NEEDS_REVIEW') return q.needsReview || q.classification === 'MULTIPLE_MARKED' || q.classification === 'UNCERTAIN';
    if (questionFilter === 'UNCONFIRMED') return !isConfirmed;
    if (questionFilter === 'CONFIRMED') return isConfirmed;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & Competition Selector */}
      <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <span>📝</span> {t.omrSubmissionsTitle || 'OMR Answer Sheet Verification Desk'}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '0.25rem 0 0 0' }}>
              {t.omrSubmissionsDesc || 'Human review desk for computer vision detections, resolving ambiguous bubbles, and final audit confirmation.'}
            </p>
          </div>

          {/* Competition Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
              {t.omrSelectCompetition || 'Competition'}:
            </label>
            <select
              value={selectedCompId || ''}
              onChange={(e) => onSelectCompetition(e.target.value)}
              style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.85rem', fontWeight: 600, background: '#F8FAFC', minWidth: '220px' }}
            >
              <option value="">-- {t.omrSelectCompetition || 'Select Competition'} --</option>
              {competitions.map(c => (
                <option key={c.id} value={c.id}>{c.title} ({c.mode})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Global Action Alerts */}
        {actionError && (
          <div style={{ background: '#FEE2E2', borderLeft: '4px solid #DC2626', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            ⚠️ {actionError}
          </div>
        )}
        {actionSuccess && (
          <div style={{ background: '#DCFCE7', borderLeft: '4px solid #16A34A', color: '#166534', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            ✅ {actionSuccess}
          </div>
        )}

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-muted)', marginRight: '0.25rem' }}>{t.filterAll || 'Status'}:</span>
          {[
            { id: 'ALL', label: t.filterAll || 'All' },
            { id: 'NEEDS_REVIEW', label: t.filterNeedsReview || 'Needs Review' },
            { id: 'IN_REVIEW', label: t.filterInReview || 'In Review' },
            { id: 'PARTIALLY_VERIFIED', label: t.filterPartiallyVerified || 'Partially Verified' },
            { id: 'VERIFIED', label: t.filterVerified || 'Fully Verified' },
            { id: 'REOPENED', label: t.filterReopened || 'Reopened' }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              style={{
                background: statusFilter === f.id ? '#1D4ED8' : '#F1F5F9',
                color: statusFilter === f.id ? '#FFFFFF' : '#475569',
                border: 'none',
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.775rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedSub ? '340px 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Submissions List */}
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1rem', boxShadow: 'var(--shadow-sm)', maxHeight: '780px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E293B', margin: 0 }}>
              {t.omrSelectSubmission || 'Submissions'} ({filteredSubmissions.length})
            </h3>
            {loadingSubmissions && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Loading...</span>}
          </div>

          {submissionsError && (
            <div style={{ color: '#DC2626', fontSize: '0.8rem', padding: '0.5rem' }}>{submissionsError}</div>
          )}

          {!selectedCompId ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
              👆 {t.omrSelectCompetition || 'Please select a competition above to view answer sheets.'}
            </div>
          ) : filteredSubmissions.length === 0 && !loadingSubmissions ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
              📭 {t.omrNoSubmissions || 'No OMR submissions found for this filter.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {filteredSubmissions.map(sub => {
                const isSelected = selectedSubId === sub.id;
                const studentName = sub.studentId?.fullName || sub.registrationId?.rollNumber || sub.rollNumber || 'Anonymous Candidate';
                const roll = sub.rollNumber || sub.registrationId?.rollNumber || 'NO ROLL';
                const confidence = sub.rawDetections?.summary?.overallConfidence;
                const needsRev = sub.status === 'NEEDS_REVIEW' || sub.rawDetections?.summary?.needsReview;

                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedSubId(sub.id)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #2563EB' : '1px solid var(--color-border)',
                      background: isSelected ? '#EFF6FF' : (needsRev ? '#FFFBEB' : '#FFFFFF'),
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 6px rgba(37, 99, 235, 0.12)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>
                        {studentName}
                      </span>
                      {renderStatusBadge(sub.status)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#64748B' }}>
                      <span><strong>Roll:</strong> {roll}</span>
                      {confidence !== undefined && (
                        <span style={{ fontWeight: 600, color: confidence < 0.70 ? '#DC2626' : '#166534' }}>
                          Conf: {Math.round(confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Active Verification Workspace */}
        {selectedSub && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Candidate Header & Control Bar */}
            <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.85rem', marginBottom: '0.85rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      {selectedSub.studentId?.fullName || selectedSub.rollNumber || 'Candidate Answer Sheet'}
                    </h3>
                    {renderStatusBadge(selectedSub.status)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', gap: '1rem' }}>
                    <span><strong>Roll Number:</strong> {selectedSub.rollNumber || 'N/A'}</span>
                    <span><strong>Format:</strong> {selectedSub.fileFormat}</span>
                    <span><strong>Uploaded:</strong> {new Date(selectedSub.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {/* Workflow Actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  {selectedSub.status !== 'VERIFIED' && (
                    <button
                      type="button"
                      onClick={() => setShowFinalizeModal(true)}
                      style={{ background: '#16A34A', color: '#FFFFFF', border: 'none', padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <span>✅</span> {t.btnFinalizeVerification || 'Finalize Verification'}
                    </button>
                  )}

                  {selectedSub.status === 'VERIFIED' && (
                    <button
                      type="button"
                      onClick={() => setShowReopenModal(true)}
                      style={{ background: '#9333EA', color: '#FFFFFF', border: 'none', padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <span>🔄</span> {t.btnReopenVerification || 'Reopen for Correction'}
                    </button>
                  )}

                  {/* Secure file view links */}
                  <a
                    href={`${apiBaseUrl}/admin/competitions/${selectedCompId}/omr/submissions/${selectedSub.id}/aligned-file`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: '#F1F5F9', color: '#1E293B', textDecoration: 'none', padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <span>🖼️</span> Aligned PNG
                  </a>
                  <a
                    href={`${apiBaseUrl}/admin/competitions/${selectedCompId}/omr/submissions/${selectedSub.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: '#F1F5F9', color: '#1E293B', textDecoration: 'none', padding: '0.45rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <span>📄</span> Original Scan
                  </a>
                </div>
              </div>

              {/* Summary Stats Row */}
              {selectedSub.rawDetections?.summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', background: '#F8FAFC', padding: '0.75rem', borderRadius: '8px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Single Marked</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#15803D' }}>{selectedSub.rawDetections.summary.singleMarked}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Blank</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#64748B' }}>{selectedSub.rawDetections.summary.blank}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Multiple Marked</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D97706' }}>{selectedSub.rawDetections.summary.multipleMarked}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Uncertain / Ambiguous</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#DC2626' }}>{selectedSub.rawDetections.summary.uncertain}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Overall Confidence</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563EB' }}>
                      {Math.round((selectedSub.rawDetections.summary.overallConfidence || 0) * 100)}%
                    </div>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              <div style={{ marginTop: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  <span>{t.omrProgress || 'Verification Progress'}: {confirmedCount} / {totalQuestions} questions confirmed</span>
                  <span>{progressPct}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${progressPct}%`, height: '100%', background: progressPct === 100 ? '#16A34A' : '#2563EB', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            </div>

            {/* Side-by-side Aligned Image Viewer & Question Deck */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '1.25rem', alignItems: 'start' }}>
              
              {/* Aligned Canvas Preview */}
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>
                    {t.omrAlignedSheetViewer || 'Aligned OMR Canvas'}
                  </h4>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button type="button" onClick={() => setImageZoom(z => Math.max(0.6, z - 0.2))} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}>-</button>
                    <button type="button" onClick={() => setImageZoom(1.0)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}>100%</button>
                    <button type="button" onClick={() => setImageZoom(z => Math.min(2.5, z + 0.2))} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}>+</button>
                  </div>
                </div>
                <div style={{ height: '620px', overflow: 'auto', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#475569', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '0.5rem' }}>
                  <img
                    src={`${apiBaseUrl}/admin/competitions/${selectedCompId}/omr/submissions/${selectedSub.id}/aligned-file`}
                    alt="Aligned OMR Sheet"
                    style={{
                      transform: `scale(${imageZoom})`,
                      transformOrigin: 'top center',
                      transition: 'transform 0.15s ease',
                      maxWidth: '100%',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                      borderRadius: '2px'
                    }}
                  />
                </div>
              </div>

              {/* Question Verification Deck */}
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                {/* Question Filter Tabs */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: '#1E293B' }}>
                    {t.omrQuestionsDeck || 'Question Verification Deck'} ({filteredQuestions.length})
                  </h4>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {[
                      { id: 'ALL', label: 'All' },
                      { id: 'NEEDS_REVIEW', label: '⚠️ Review Flagged' },
                      { id: 'UNCONFIRMED', label: 'Unconfirmed' },
                      { id: 'CONFIRMED', label: 'Confirmed' }
                    ].map(btn => (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => setQuestionFilter(btn.id)}
                        style={{
                          background: questionFilter === btn.id ? '#1D4ED8' : '#F1F5F9',
                          color: questionFilter === btn.id ? '#FFFFFF' : '#475569',
                          border: 'none',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question Cards List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '580px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {filteredQuestions.map(qItem => {
                    const qNum = qItem.questionNumber;
                    const confirmed = confirmedAnswersMap[qNum];
                    const draft = draftAnswers[qNum] || { selectedOption: confirmed?.selectedOption || qItem.detectedOption || (qItem.classification === 'BLANK' ? 'BLANK' : ''), reason: confirmed?.reason || '' };
                    
                    const isConfirmed = Boolean(confirmed?.isConfirmed);
                    const isSaving = Boolean(savingQuestion[qNum]);

                    // Machine vs Selected comparison
                    const machOpt = qItem.detectedOption || (qItem.classification === 'BLANK' ? 'BLANK' : null);
                    const isModified = draft.selectedOption && draft.selectedOption !== machOpt;

                    // Badge classification
                    const cls = qItem.classification;
                    let badgeBg = '#F1F5F9', badgeColor = '#475569';
                    if (cls === 'SINGLE_MARKED') { badgeBg = '#DCFCE7'; badgeColor = '#166534'; }
                    else if (cls === 'BLANK') { badgeBg = '#F1F5F9'; badgeColor = '#64748B'; }
                    else if (cls === 'MULTIPLE_MARKED') { badgeBg = '#FEF3C7'; badgeColor = '#B45309'; }
                    else if (cls === 'UNCERTAIN') { badgeBg = '#FEE2E2'; badgeColor = '#991B1B'; }

                    return (
                      <div
                        key={qNum}
                        style={{
                          border: isConfirmed ? '1px solid #BBF7D0' : (qItem.needsReview ? '2px solid #FCA5A5' : '1px solid #E2E8F0'),
                          background: isConfirmed ? '#F0FDF4' : (qItem.needsReview ? '#FEF2F2' : '#FFFFFF'),
                          borderRadius: '10px',
                          padding: '0.85rem 1rem',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                              Q{qNum}
                            </span>
                            <span style={{ background: badgeBg, color: badgeColor, padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                              {cls}
                            </span>
                            {isConfirmed && (
                              <span style={{ background: '#22C55E', color: '#FFFFFF', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 800 }}>
                                ✓ CONFIRMED: {confirmed.selectedOption}
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Conf: {Math.round(qItem.confidence * 100)}%
                          </div>
                        </div>

                        {/* Machine detection feedback */}
                        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '0.65rem' }}>
                          <span><strong>{t.omrMachineDetection || 'Machine'}:</strong> {machOpt ? machOpt : '(No clean mark)'}</span>
                          {qItem.reviewReason && (
                            <span style={{ color: '#B91C1C', marginLeft: '0.75rem', fontWeight: 600 }}>
                              • {qItem.reviewReason}
                            </span>
                          )}
                        </div>

                        {/* Options Selector Bar */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Select Answer:</span>
                          {['A', 'B', 'C', 'D', 'BLANK'].map(opt => {
                            const isSelected = draft.selectedOption === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                disabled={selectedSub.status === 'VERIFIED'}
                                onClick={() => {
                                  setDraftAnswers(prev => ({
                                    ...prev,
                                    [qNum]: {
                                      ...prev[qNum],
                                      selectedOption: opt
                                    }
                                  }));
                                }}
                                style={{
                                  padding: '0.3rem 0.65rem',
                                  borderRadius: '6px',
                                  fontSize: '0.775rem',
                                  fontWeight: 800,
                                  cursor: selectedSub.status === 'VERIFIED' ? 'not-allowed' : 'pointer',
                                  border: isSelected ? '2px solid #1D4ED8' : '1px solid #CBD5E1',
                                  background: isSelected ? '#1D4ED8' : '#F8FAFC',
                                  color: isSelected ? '#FFFFFF' : '#1E293B'
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}

                          {selectedSub.status !== 'VERIFIED' && (
                            <button
                              type="button"
                              onClick={() => handleSaveQuestion(qNum)}
                              disabled={isSaving || !draft.selectedOption}
                              style={{
                                marginLeft: 'auto',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '0.3rem 0.75rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                opacity: isSaving ? 0.7 : 1
                              }}
                            >
                              {isSaving ? 'Saving...' : 'Confirm Q' + qNum}
                            </button>
                          )}
                        </div>

                        {/* Correction Reason (Mandatory if modified or uncertain) */}
                        {isModified && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#FFFBEB', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                            <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#B45309', marginBottom: '0.2rem' }}>
                              {t.omrCorrectionReason || 'Correction Reason (Required when overriding machine detection):'}
                            </label>
                            <input
                              type="text"
                              disabled={selectedSub.status === 'VERIFIED'}
                              value={draft.reason || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraftAnswers(prev => ({
                                  ...prev,
                                  [qNum]: {
                                    ...prev[qNum],
                                    reason: val
                                  }
                                }));
                              }}
                              placeholder={t.omrReasonPlaceholder || 'e.g. Faint mark on B, candidate clearly intended C'}
                              style={{ width: '100%', padding: '0.35rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Audit Trail & History Section */}
            {selectedSub.confirmedAnswers?.correctionHistory?.length > 0 && (
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#1E293B' }}>
                  📜 {t.omrCorrectionHistory || 'Manual Correction Audit History'} ({selectedSub.confirmedAnswers.correctionHistory.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {selectedSub.confirmedAnswers.correctionHistory.map((h, idx) => (
                    <div key={idx} style={{ padding: '0.4rem 0.6rem', background: '#F8FAFC', borderRadius: '6px', fontSize: '0.775rem', display: 'flex', justifyContent: 'space-between', borderLeft: '3px solid #2563EB' }}>
                      <div>
                        <strong>Q{h.questionNumber}:</strong> Changed from <code>{h.previousOption || 'None'}</code> to <strong>{h.newOption}</strong>
                        {h.reason && <span style={{ color: '#475569', marginLeft: '0.5rem' }}>({h.reason})</span>}
                      </div>
                      <div style={{ color: '#94A3B8', fontSize: '0.725rem' }}>
                        {new Date(h.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FINALIZATION CONFIRMATION MODAL */}
      {showFinalizeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '520px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem' }}>
              ✅ {t.omrFinalizeConfirmTitle || 'Finalize OMR Verification?'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
              {t.omrFinalizeConfirmDesc || 'Once finalized, this submission will be marked as fully VERIFIED. All confirmed answers will be locked.'}
            </p>

            <div style={{ background: '#F8FAFC', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #E2E8F0' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.825rem', color: '#1E293B', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={confirmRemainingClean}
                  onChange={(e) => setConfirmRemainingClean(e.target.checked)}
                  style={{ marginTop: '0.15rem' }}
                />
                <span>{t.omrConfirmCleanPrompt || 'Confirm all remaining clear/single-marked questions match machine detection.'}</span>
              </label>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                {t.omrReviewNotes || 'Reviewer Notes (Optional):'}
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={t.omrReviewNotesPlaceholder || 'Enter general reviewer notes...'}
                rows={3}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.825rem' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                disabled={finalizing}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#F8FAFC', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalizeVerification}
                disabled={finalizing}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', background: '#16A34A', color: '#FFFFFF', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
              >
                {finalizing ? 'Finalizing...' : 'Confirm & Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN MODAL */}
      {showReopenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#9333EA', marginBottom: '0.5rem' }}>
              🔄 {t.omrReopenTitle || 'Reopen OMR Verification'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
              {t.omrReopenDesc || 'Please provide an administrative reason to reopen this verified submission:'}
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={t.omrReopenReasonPlaceholder || 'Enter reason for reopening (min 5 characters)...'}
                rows={3}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.825rem' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                disabled={reopening}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#F8FAFC', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReopenVerification}
                disabled={reopening || reopenReason.trim().length < 5}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', background: '#9333EA', color: '#FFFFFF', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
              >
                {reopening ? 'Reopening...' : 'Confirm Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
