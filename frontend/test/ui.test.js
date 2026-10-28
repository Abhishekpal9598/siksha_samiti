import test from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../src/translations.js';

test('12. Hindi and English UI & Localization Verification', async (t) => {
  const requiredAuthKeys = [
    'loginStudentTitle',
    'loginStudentSubtitle',
    'loginAdminTitle',
    'loginAdminSubtitle',
    'loginAdminBadge',
    'mobileLabel',
    'mobilePlaceholder',
    'passwordLabel',
    'passwordPlaceholder',
    'showPassword',
    'hidePassword',
    'btnLoginSubmit',
    'loggingIn',
    'loginErrorGeneric',
    'loginStudentRoleMismatch',
    'loginAdminRoleMismatch',
    'dontHaveAccount',
    'registerHere',
    'dashboardStudentTitle',
    'dashboardAdminTitle',
    'welcomeUser',
    'btnLogout',
    'loggingOut',
    'roleLabel',
    'roleStudent',
    'roleAdmin',
    'accountStatus',
    'statusActive',
    'profileCardTitle',
    'schoolLabel',
    'classLabel',
    'designationLabel',
    'competitionsSectionTitle',
    'noCompetitionsStudent',
    'examModesCardTitle',
    'examModesCardDesc',
    'resultsCardTitle',
    'resultsCardDesc',
    'adminOverviewTitle',
    'adminSecurityNotice',
    'adminCompetitionsCardTitle',
    'adminCompetitionsCardDesc',
    'adminOmrCardTitle',
    'adminOmrCardDesc',
    'adminResultsCardTitle',
    'adminResultsCardDesc',
    'backToHome'
  ];

  await t.test('All Phase 2 Part 4-7 authentication keys exist in Hindi (hi)', () => {
    assert.ok(translations.hi, 'translations.hi must be defined');
    for (const key of requiredAuthKeys) {
      assert.ok(translations.hi[key], `Missing Hindi translation key: ${key}`);
      assert.equal(typeof translations.hi[key], 'string');
      assert.ok(translations.hi[key].trim().length > 0);
    }
  });

  await t.test('All Phase 2 Part 4-7 authentication keys exist in English (en)', () => {
    assert.ok(translations.en, 'translations.en must be defined');
    for (const key of requiredAuthKeys) {
      assert.ok(translations.en[key], `Missing English translation key: ${key}`);
      assert.equal(typeof translations.en[key], 'string');
      assert.ok(translations.en[key].trim().length > 0);
    }
  });

  await t.test('Full parity between Hindi and English dictionaries', () => {
    const hiKeys = Object.keys(translations.hi).sort();
    const enKeys = Object.keys(translations.en).sort();

    const missingInEn = hiKeys.filter(k => !(k in translations.en));
    const missingInHi = enKeys.filter(k => !(k in translations.hi));

    assert.deepEqual(missingInEn, [], 'No keys should be missing in English');
    assert.deepEqual(missingInHi, [], 'No keys should be missing in Hindi');
  });

  await t.test('Specific Hindi strings contain expected Devanagari characters', () => {
    assert.equal(translations.hi.loginStudentTitle, 'छात्र लॉगिन');
    assert.equal(translations.hi.loginAdminTitle, 'शिक्षा समिति व्यवस्थापक लॉगिन');
    assert.equal(translations.hi.dashboardStudentTitle, 'छात्र डैशबोर्ड');
    assert.equal(translations.hi.dashboardAdminTitle, 'समिति व्यवस्थापक पोर्टल');
    assert.equal(translations.hi.btnLogout, 'लॉगआउट');
  });

  await t.test('Specific English strings contain expected text', () => {
    assert.equal(translations.en.loginStudentTitle, 'Student Login');
    assert.equal(translations.en.loginAdminTitle, 'Education Committee Admin Login');
    assert.equal(translations.en.dashboardStudentTitle, 'Student Dashboard');
    assert.equal(translations.en.dashboardAdminTitle, 'Education Committee Admin Portal');
    assert.equal(translations.en.btnLogout, 'Log Out');
  });

  const requiredPhase3Keys = [
    'tabOverview',
    'tabCompetitions',
    'tabQuestionBank',
    'createCompetitionBtn',
    'editCompetitionBtn',
    'manageQuestionsBtn',
    'competitionTitle',
    'competitionDescription',
    'competitionExamDate',
    'competitionStartTime',
    'competitionEndTime',
    'competitionDuration',
    'competitionMode',
    'modeOnline',
    'modeOmr',
    'modeBoth',
    'eligibleClasses',
    'totalMarks',
    'marksPerQuestion',
    'negativeMarking',
    'negativeDeduction',
    'regOpenDate',
    'regCloseDate',
    'statusLabel',
    'statusDraft',
    'statusPublished',
    'statusClosed',
    'statusArchived',
    'publishBtn',
    'closeBtn',
    'archiveBtn',
    'noCompetitionsFound',
    'saveCompetition',
    'cancelBtn',
    'competitionCreatedSuccess',
    'competitionUpdatedSuccess',
    'statusUpdatedSuccess',
    'addQuestionBtn',
    'editQuestionBtn',
    'deleteQuestionBtn',
    'questionPrompt',
    'optionA',
    'optionB',
    'optionC',
    'optionD',
    'correctAnswer',
    'questionMarks',
    'questionNegativeMarks',
    'explanation',
    'subject',
    'topic',
    'questionClass',
    'saveQuestion',
    'confirmDeleteQuestion',
    'questionCreatedSuccess',
    'questionUpdatedSuccess',
    'questionDeletedSuccess',
    'noQuestionsFound',
    'selectCompetitionToViewQuestions',
    'totalQuestionsCount',
    'availableCompetitions',
    'myRegistrations',
    'registerForCompBtn',
    'alreadyRegistered',
    'notEligible',
    'registrationClosed',
    'registrationNotStarted',
    'selectExamMode',
    'examModeNotice',
    'rollNumberLabel',
    'registrationSuccess',
    'viewRollSlip',
    'compExamDetails',
    'noRegistrationsYet',
    'noAvailableComps',
    'eligibleClassesLabel',
    'marksLabel',
    'examDateLabel',
    'examTimeLabel',
    'durationLabel',
    'registrationWindowLabel',
    'confirmedModeLabel',
    'statusConfirmed'
  ];

  await t.test('All Phase 3 Competition & Question Bank keys exist in Hindi (hi)', () => {
    for (const key of requiredPhase3Keys) {
      assert.ok(translations.hi[key], `Missing Hindi Phase 3 key: ${key}`);
      assert.equal(typeof translations.hi[key], 'string');
      assert.ok(translations.hi[key].trim().length > 0);
    }
  });

  await t.test('All Phase 3 Competition & Question Bank keys exist in English (en)', () => {
    for (const key of requiredPhase3Keys) {
      assert.ok(translations.en[key], `Missing English Phase 3 key: ${key}`);
      assert.equal(typeof translations.en[key], 'string');
      assert.ok(translations.en[key].trim().length > 0);
    }
  });

  await t.test('Phase 3 specific Hindi strings contain expected Devanagari characters', () => {
    assert.equal(translations.hi.tabCompetitions, 'प्रतियोगिता प्रबंधन');
    assert.equal(translations.hi.tabQuestionBank, 'प्रश्न बैंक');
    assert.equal(translations.hi.registerForCompBtn, 'पंजीकरण करें');
    assert.equal(translations.hi.rollNumberLabel, 'आवंटित अनुक्रमांक (Roll Number)');
    assert.equal(translations.hi.modeOnline, 'केवल ऑनलाइन (Online MCQ)');
    assert.equal(translations.hi.modeOmr, 'केवल ओएमआर (OMR Sheet)');
  });

  await t.test('Phase 3 specific English strings contain expected text', () => {
    assert.equal(translations.en.tabCompetitions, 'Competition Management');
    assert.equal(translations.en.tabQuestionBank, 'Question Bank');
    assert.equal(translations.en.registerForCompBtn, 'Register Now');
    assert.equal(translations.en.rollNumberLabel, 'Allotted Roll Number');
    assert.equal(translations.en.modeOnline, 'Online MCQ Only');
    assert.equal(translations.en.modeOmr, 'OMR Sheet Only');
  });

  const requiredPhase4Keys = [
    'tabAttempts',
    'attemptMonitoringTitle',
    'selectCompToViewAttempts',
    'totalAttemptsCount',
    'inProgressCount',
    'submittedCount',
    'autoSubmittedCount',
    'thRollNumber',
    'thStudentName',
    'thMobile',
    'thStatus',
    'thStartedAt',
    'thSubmittedAt',
    'thLastSaved',
    'thAnsweredQuestions',
    'noAttemptsFound',
    'refreshAttempts',
    'btnStartExam',
    'btnResumeExam',
    'examAlreadySubmittedMsg',
    'omrStudentNoticeTitle',
    'omrStudentNoticeDesc',
    'examNotStartedNotice',
    'examClosedNotice',
    'examLoading',
    'examTimerLabel',
    'examTimeUp',
    'questionPaletteTitle',
    'paletteAnswered',
    'paletteNotAnswered',
    'paletteMarkedReview',
    'paletteCurrent',
    'questionNumberPrefix',
    'clearResponseBtn',
    'markForReviewBtn',
    'unmarkReviewBtn',
    'prevQuestionBtn',
    'nextQuestionBtn',
    'submitExamBtn',
    'confirmSubmitTitle',
    'confirmSubmitDesc',
    'submitSummaryAnswered',
    'submitSummaryTotal',
    'submitSummaryReview',
    'confirmSubmitBtn',
    'cancelSubmitBtn',
    'examSubmittedSuccessTitle',
    'examSubmittedSuccessDesc',
    'examSubmittedNotice',
    'returnToDashboardBtn',
    'autosaveStatusSaved',
    'autosaveStatusSaving',
    'autosaveStatusError',
    'instructionsTitle',
    'instructionsPoint1',
    'instructionsPoint2',
    'instructionsPoint3',
    'instructionsPoint4',
    'autoSubmitNotice'
  ];

  await t.test('All Phase 4 Examination Engine keys exist in Hindi (hi)', () => {
    for (const key of requiredPhase4Keys) {
      assert.ok(translations.hi[key], `Missing Hindi Phase 4 key: ${key}`);
      assert.equal(typeof translations.hi[key], 'string');
      assert.ok(translations.hi[key].trim().length > 0);
    }
  });

  await t.test('All Phase 4 Examination Engine keys exist in English (en)', () => {
    for (const key of requiredPhase4Keys) {
      assert.ok(translations.en[key], `Missing English Phase 4 key: ${key}`);
      assert.equal(typeof translations.en[key], 'string');
      assert.ok(translations.en[key].trim().length > 0);
    }
  });

  await t.test('Phase 4 specific Hindi strings contain expected Devanagari characters', () => {
    assert.equal(translations.hi.tabAttempts, 'परीक्षा मॉनिटरिंग');
    assert.equal(translations.hi.btnStartExam, '🚀 ऑनलाइन परीक्षा शुरू करें');
    assert.equal(translations.hi.questionPaletteTitle, 'प्रश्न तालिका (Question Palette)');
    assert.equal(translations.hi.submitExamBtn, 'परीक्षा जमा करें (Submit Exam)');
  });

  await t.test('Phase 4 specific English strings contain expected text', () => {
    assert.equal(translations.en.tabAttempts, 'Attempt Monitoring');
    assert.equal(translations.en.btnStartExam, '🚀 Start Online Exam');
    assert.equal(translations.en.questionPaletteTitle, 'Question Palette');
    assert.equal(translations.en.submitExamBtn, 'Submit Exam');
  });

  // --- PHASE 5 TESTS ---
  const requiredPhase5Keys = [
    'resultStatusNotEvaluated',
    'resultStatusEvaluated',
    'resultStatusPendingApproval',
    'resultStatusApproved',
    'resultStatusPublished',
    'resultStatusRevisionRequired',
    'rank',
    'score',
    'finalScore',
    'positiveMarks',
    'negativeDeduction',
    'maxMarks',
    'correctAnswers',
    'incorrectAnswers',
    'unanswered',
    'meritList',
    'internalMeritList',
    'publicMeritList',
    'publicMeritListEnabled',
    'publicMeritListDisabled',
    'togglePublicMeritList',
    'tieBreakerRules',
    'ruleFinalScore',
    'ruleCorrect',
    'ruleIncorrect',
    'ruleTime',
    'standardRankingNote',
    'btnEvaluate',
    'btnReEvaluate',
    'btnRequestApproval',
    'btnApprove',
    'btnRejectRevision',
    'btnPublishResults',
    'btnUnpublishResults',
    'reEvaluationReason',
    'enterReason',
    'scoringVersion',
    'auditHistory',
    'myScorecard',
    'scorecardNotice',
    'resultNotPublished',
    'noPublishedResults',
    'viewScorecard',
    'viewPublicMerit',
    'candidateName',
    'rollNumber',
    'school',
    'classGrade'
  ];

  await t.test('All Phase 5 Central Scoring & Merit List keys exist in Hindi (hi)', () => {
    for (const key of requiredPhase5Keys) {
      assert.ok(translations.hi[key], `Missing Hindi Phase 5 key: ${key}`);
      assert.equal(typeof translations.hi[key], 'string');
      assert.ok(translations.hi[key].trim().length > 0);
    }
  });

  await t.test('All Phase 5 Central Scoring & Merit List keys exist in English (en)', () => {
    for (const key of requiredPhase5Keys) {
      assert.ok(translations.en[key], `Missing English Phase 5 key: ${key}`);
      assert.equal(typeof translations.en[key], 'string');
      assert.ok(translations.en[key].trim().length > 0);
    }
  });

  await t.test('Phase 5 specific Hindi strings contain expected Devanagari characters', () => {
    assert.equal(translations.hi.resultStatusPublished, 'परिणाम प्रकाशित');
    assert.equal(translations.hi.rank, 'रैंक');
    assert.equal(translations.hi.finalScore, 'अंतिम प्राप्तांक');
    assert.equal(translations.hi.btnApprove, 'परिणाम व मेरिट अनुमोदित करें');
    assert.equal(translations.hi.myScorecard, 'मेरा परीक्षा परिणाम व स्कोरकार्ड');
  });

  await t.test('Phase 5 specific English strings contain expected text', () => {
    assert.equal(translations.en.resultStatusPublished, 'Published');
    assert.equal(translations.en.rank, 'Rank');
    assert.equal(translations.en.finalScore, 'Final Score');
    assert.equal(translations.en.btnApprove, 'Approve Results & Merit List');
    assert.equal(translations.en.myScorecard, 'My Exam Result & Scorecard');
  });

  // --- PHASE 6 OMR VERIFICATION TESTS ---
  const requiredPhase6Keys = [
    'tabOmrVerification',
    'omrSubmissionsTitle',
    'omrSubmissionsDesc',
    'omrSelectCompetition',
    'omrSelectSubmission',
    'omrCandidateDetails',
    'omrAlignedSheetViewer',
    'omrQuestionsDeck',
    'omrConfirmedAnswers',
    'omrMachineDetection',
    'omrHumanConfirmation',
    'omrFinalizeConfirmTitle',
    'omrReopenTitle',
    'omrCorrectionHistory'
  ];

  await t.test('All Phase 6 OMR Verification keys exist in Hindi (hi)', () => {
    for (const key of requiredPhase6Keys) {
      assert.ok(translations.hi[key], `Missing Hindi Phase 6 key: ${key}`);
      assert.equal(typeof translations.hi[key], 'string');
      assert.ok(translations.hi[key].trim().length > 0);
    }
  });

  await t.test('All Phase 6 OMR Verification keys exist in English (en)', () => {
    for (const key of requiredPhase6Keys) {
      assert.ok(translations.en[key], `Missing English Phase 6 key: ${key}`);
      assert.equal(typeof translations.en[key], 'string');
      assert.ok(translations.en[key].trim().length > 0);
    }
  });

  // --- PHASE 7 FRONTEND AUDIT & REGISTRATION MANAGEMENT TESTS ---
  const requiredPhase7Keys = [
    'tabRegistrations',
    'tabAccountProfile',
    'roleCommitteeHead',
    'dashboardHeadTitle',
    'governanceNoticeHead',
    'governanceNoticeAdmin',
    'downloadPersonalizedOmrBtn',
    'downloadGenericOmrBtn',
    'totalRegistrationsComp',
    'studentProfileTitle',
    'accountDetailsTitle',
    'securityNoticeText',
    'governanceOversightTitle'
  ];

  await t.test('All Phase 7 Registration & Governance keys exist in Hindi (hi)', () => {
    for (const key of requiredPhase7Keys) {
      assert.ok(translations.hi[key], `Missing Hindi Phase 7 key: ${key}`);
      assert.equal(typeof translations.hi[key], 'string');
      assert.ok(translations.hi[key].trim().length > 0);
    }
  });

  await t.test('All Phase 7 Registration & Governance keys exist in English (en)', () => {
    for (const key of requiredPhase7Keys) {
      assert.ok(translations.en[key], `Missing English Phase 7 key: ${key}`);
      assert.equal(typeof translations.en[key], 'string');
      assert.ok(translations.en[key].trim().length > 0);
    }
  });

  await t.test('Phase 7 specific Hindi strings contain expected Devanagari characters', () => {
    assert.equal(translations.hi.tabRegistrations, 'पंजीकृत छात्र एवं ओएमआर');
    assert.equal(translations.hi.roleCommitteeHead, 'समिति अध्यक्ष (Committee Head)');
    assert.equal(translations.hi.dashboardHeadTitle, 'समिति अध्यक्ष शासन पोर्टल');
    assert.equal(translations.hi.studentProfileTitle, 'छात्र प्रोफ़ाइल एवं खाता जानकारी');
  });

  await t.test('Phase 7 specific English strings contain expected text', () => {
    assert.equal(translations.en.tabRegistrations, 'Registrations & OMR Sheets');
    assert.equal(translations.en.roleCommitteeHead, 'Committee Head');
    assert.equal(translations.en.dashboardHeadTitle, 'Committee Head Governance Portal');
    assert.equal(translations.en.studentProfileTitle, 'Student Profile & Account Details');
  });
});
