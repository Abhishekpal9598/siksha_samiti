import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:5000/api/v1';

async function auditBackendData() {
  console.log('=== STARTING FUNCTIONAL & DATA INTEGRITY AUDIT ===\n');

  // Helper: Login and extract cookie
  const loginUser = async (mobile, password) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, password })
    });
    const data = await res.json();
    assert.equal(res.status, 200, `Login failed for ${mobile}: ${JSON.stringify(data)}`);
    assert.ok(data.success, 'Login response must indicate success');
    const cookie = res.headers.get('set-cookie');
    return { user: data.user, cookie: cookie ? cookie.split(';')[0] : '' };
  };

  // 1. Unauthenticated Security Boundary Check
  console.log('1. Checking unauthenticated access boundaries...');
  const unauthRegs = await fetch(`${BASE_URL}/me/registrations`);
  assert.equal(unauthRegs.status, 401, 'Unauthenticated /me/registrations must return 401');

  const unauthResults = await fetch(`${BASE_URL}/me/results`);
  assert.equal(unauthResults.status, 401, 'Unauthenticated /me/results must return 401');
  console.log('   ✓ Unauthenticated requests strictly blocked with HTTP 401.\n');

  // 2. Student A (Pooja Sharma) Login & Data Verification
  console.log('2. Auditing Student A (Pooja Sharma) real data...');
  const pooja = await loginUser('9876543210', 'Student@Pass123');
  assert.equal(pooja.user.fullName, 'Pooja Sharma');
  assert.equal(pooja.user.role, 'student');
  console.log(`   ✓ Authenticated as ${pooja.user.fullName} (${pooja.user.role})`);

  // Fetch Pooja's Registrations
  const poojaRegsRes = await fetch(`${BASE_URL}/me/registrations`, {
    headers: { Cookie: pooja.cookie }
  });
  const poojaRegsData = await poojaRegsRes.json();
  assert.equal(poojaRegsRes.status, 200);
  assert.ok(poojaRegsData.success);
  assert.equal(poojaRegsData.registrations.length, 2, 'Pooja must have exactly 2 registrations');

  // Verify Pooja sees ONLY her own roll numbers and zero data from Amit
  const poojaRolls = poojaRegsData.registrations.map(r => r.rollNumber);
  assert.ok(poojaRolls.includes('2026-1001'), 'Must include 2026-1001 (Upcoming OMR)');
  assert.ok(poojaRolls.includes('2025-0501'), 'Must include 2025-0501 (Past Online)');
  assert.ok(!poojaRolls.includes('2026-1002'), 'Must NOT contain Amit Patel roll number');
  assert.ok(!poojaRolls.includes('2025-0502'), 'Must NOT contain Amit Patel roll number');
  console.log(`   ✓ Registrations isolated: ${poojaRolls.join(', ')} (Zero data leakage from other students)`);

  // Fetch Pooja's Results
  const poojaResultsRes = await fetch(`${BASE_URL}/me/results`, {
    headers: { Cookie: pooja.cookie }
  });
  const poojaResultsData = await poojaResultsRes.json();
  assert.equal(poojaResultsRes.status, 200);
  assert.ok(poojaResultsData.success);
  assert.equal(poojaResultsData.results.length, 1, 'Pooja must have 1 published result');

  const poojaResult = poojaResultsData.results[0];
  assert.equal(poojaResult.rollNumber, '2025-0501');
  assert.equal(poojaResult.studentName, 'Pooja Sharma');
  assert.equal(poojaResult.rank, 1, 'Pooja achieved Rank 1');
  assert.equal(poojaResult.finalScore, 50);
  assert.equal(poojaResult.maximumMarks, 50);
  assert.equal(poojaResult.correctAnswers, 2);
  assert.equal(poojaResult.incorrectAnswers, 0);
  assert.equal(poojaResult.positiveMarks, 50);
  assert.equal(poojaResult.negativeDeduction, 0);
  console.log(`   ✓ Published Scorecard: Rank #${poojaResult.rank}, Score ${poojaResult.finalScore}/${poojaResult.maximumMarks} (✓${poojaResult.correctAnswers}, ✗${poojaResult.incorrectAnswers})\n`);

  // 3. Student B (Amit Patel) Login & Data Isolation Verification
  console.log('3. Auditing Student B (Amit Patel) real data & isolation...');
  const amit = await loginUser('9988776655', 'Student@Pass123');
  assert.equal(amit.user.fullName, 'Amit Patel');
  assert.equal(amit.user.role, 'student');

  const amitRegsRes = await fetch(`${BASE_URL}/me/registrations`, {
    headers: { Cookie: amit.cookie }
  });
  const amitRegsData = await amitRegsRes.json();
  assert.equal(amitRegsData.registrations.length, 2);
  const amitRolls = amitRegsData.registrations.map(r => r.rollNumber);
  assert.ok(amitRolls.includes('2026-1002'));
  assert.ok(amitRolls.includes('2025-0502'));
  assert.ok(!amitRolls.includes('2026-1001'), 'Amit must NOT see Pooja registration');
  console.log(`   ✓ Amit Registrations isolated: ${amitRolls.join(', ')}`);

  const amitResultsRes = await fetch(`${BASE_URL}/me/results`, {
    headers: { Cookie: amit.cookie }
  });
  const amitResultsData = await amitResultsRes.json();
  assert.equal(amitResultsData.results.length, 1);
  const amitResult = amitResultsData.results[0];
  assert.equal(amitResult.rollNumber, '2025-0502');
  assert.equal(amitResult.studentName, 'Amit Patel');
  assert.equal(amitResult.rank, 2, 'Amit achieved Rank 2');
  assert.equal(amitResult.finalScore, 20);
  assert.equal(amitResult.positiveMarks, 25);
  assert.equal(amitResult.negativeDeduction, 5); // 1 wrong answer with 5 mark penalty
  assert.equal(amitResult.correctAnswers, 1);
  assert.equal(amitResult.incorrectAnswers, 1);
  console.log(`   ✓ Amit Scorecard: Rank #${amitResult.rank}, Score ${amitResult.finalScore}/${amitResult.maximumMarks} (Neg Deduction: -${amitResult.negativeDeduction})`);
  console.log('   ✓ Student isolation verified: Amit and Pooja see strictly their own results.\n');

  // 4. Public Merit List Verification
  console.log('4. Auditing Public Merit List...');
  const pastCompId = poojaResult.competitionId;
  const meritRes = await fetch(`${BASE_URL}/competitions/${pastCompId}/public-merit-list`);
  assert.equal(meritRes.status, 200);
  const meritData = await meritRes.json();
  assert.ok(meritData.success);
  assert.equal(meritData.meritList.length, 2);

  // Check ordering: Rank 1 first, Rank 2 second
  assert.equal(meritData.meritList[0].rank, 1);
  assert.equal(meritData.meritList[0].studentName, 'Pooja Sharma');
  assert.equal(meritData.meritList[1].rank, 2);
  assert.equal(meritData.meritList[1].studentName, 'Amit Patel');

  // Check data safety: NO answers, phone numbers, or tokens in public merit list
  meritData.meritList.forEach(entry => {
    assert.equal(entry.mobile, undefined, 'Phone number must not leak in public merit list');
    assert.equal(entry.answers, undefined, 'Answers must not leak in public merit list');
    assert.equal(entry.omrSheetToken, undefined, 'OMR tokens must not leak in public merit list');
  });
  console.log('   ✓ Public Merit List accurately ordered by standard competition ranks.');
  console.log('   ✓ Zero sensitive data leakage confirmed in public merit list.\n');

  console.log('=== ALL FUNCTIONAL AND DATA INTEGRITY AUDIT CHECKS PASSED ===');
}

auditBackendData().catch(err => {
  console.error('[AUDIT FAILED]', err);
  process.exit(1);
});
