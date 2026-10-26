import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../src/models/user.model.js';
import { Competition } from '../src/models/competition.model.js';
import { Question } from '../src/models/question.model.js';
import { Registration } from '../src/models/registration.model.js';
import { Attempt } from '../src/models/attempt.model.js';
import { Result } from '../src/models/result.model.js';
import { evaluateCompetition } from '../src/services/scoring.service.js';

async function seedAndAudit() {
  await mongoose.connect('mongodb://127.0.0.1:27017/education_committee');
  console.log('--- 1. CONNECTED TO MONGODB ---');

  const passwordHash = await bcrypt.hash('Student@Pass123', 10);
  const adminPasswordHash = await bcrypt.hash('Admin@Pass123', 10);

  // 1. Create Committee Head
  let committeeHead = await User.findOne({ mobileNormalized: '9999900001' });
  if (!committeeHead) {
    committeeHead = await User.create({
      fullName: 'Dr. Sharma (Committee Head)',
      mobile: '+91 99999 00001',
      mobileNormalized: '9999900001',
      passwordHash: adminPasswordHash,
      role: 'committee_head',
      isActive: true,
      school: 'Education Committee Central Office',
      classOrGrade: 'Exam Controller'
    });
  } else {
    committeeHead.role = 'committee_head';
    committeeHead.passwordHash = adminPasswordHash;
    await committeeHead.save();
  }

  // 2. Create Student A: Pooja Sharma
  let studentA = await User.findOne({ mobileNormalized: '9876543210' });
  if (!studentA) {
    studentA = await User.create({
      fullName: 'Pooja Sharma',
      mobile: '+91 98765 43210',
      mobileNormalized: '9876543210',
      passwordHash,
      role: 'student',
      school: 'Adarsh Vidya Mandir Inter College',
      classOrGrade: 'Class 10',
      isActive: true
    });
  } else {
    studentA.fullName = 'Pooja Sharma';
    studentA.passwordHash = passwordHash;
    studentA.school = 'Adarsh Vidya Mandir Inter College';
    studentA.classOrGrade = 'Class 10';
    await studentA.save();
  }

  // 3. Create Student B: Amit Patel
  let studentB = await User.findOne({ mobileNormalized: '9988776655' });
  if (!studentB) {
    studentB = await User.create({
      fullName: 'Amit Patel',
      mobile: '+91 99887 76655',
      mobileNormalized: '9988776655',
      passwordHash,
      role: 'student',
      school: 'Shri Ram Vidya Mandir',
      classOrGrade: 'Class 10',
      isActive: true
    });
  } else {
    studentB.fullName = 'Amit Patel';
    studentB.passwordHash = passwordHash;
    studentB.school = 'Shri Ram Vidya Mandir';
    studentB.classOrGrade = 'Class 10';
    await studentB.save();
  }

  // 4. Create Competition 1: Upcoming Future Exam
  await Competition.deleteMany({ title: { $in: ['वार्षिक आंचलिक प्रतिभा खोज 2026', 'गणित एवं सामान्य ज्ञान छात्रवृत्ति 2025'] } });

  const futureExamDate = new Date();
  futureExamDate.setDate(futureExamDate.getDate() + 5);

  const upcomingComp = await Competition.create({
    title: 'वार्षिक आंचलिक प्रतिभा खोज 2026',
    titleHi: 'वार्षिक आंचलिक प्रतिभा खोज 2026',
    titleEn: 'Annual Regional Talent Search 2026',
    description: 'समिति द्वारा ग्रामीण एवं आंचलिक विद्यार्थियों हेतु पारदर्शी वस्तुनिष्ठ परीक्षा।',
    category: 'State Academic Talent',
    status: 'PUBLISHED',
    resultStatus: 'NOT_EVALUATED',
    mode: 'BOTH',
    examDate: futureExamDate,
    startTime: '10:00 AM',
    endTime: '11:30 AM',
    durationMinutes: 90,
    totalMarks: 100,
    marksPerQuestion: 25,
    eligibleClasses: ['Class 10', 'Class 11'],
    registrationOpensAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
    registrationClosesAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    negativeMarking: { enabled: true, deduction: 0.25 }
  });

  // 5. Create Competition 2: Past Exam with Questions, Attempts and Approved/Published Results
  const pastExamDate = new Date();
  pastExamDate.setDate(pastExamDate.getDate() - 10);

  const pastComp = await Competition.create({
    title: 'गणित एवं सामान्य ज्ञान छात्रवृत्ति 2025',
    titleHi: 'गणित एवं सामान्य ज्ञान छात्रवृत्ति 2025',
    titleEn: 'Math & General Knowledge Scholarship 2025',
    description: 'पूर्व संपन्न छात्रवृत्ति प्रतियोगिता जिसका परिणाम समिति द्वारा अनुमोदित व प्रकाशित है।',
    category: 'Scholarship Merit',
    status: 'PUBLISHED',
    resultStatus: 'NOT_EVALUATED',
    mode: 'ONLINE_MCQ',
    examDate: pastExamDate,
    examStartsAt: new Date(pastExamDate.getTime() - 3600000),
    examEndsAt: new Date(pastExamDate.getTime() + 3600000),
    startTime: '11:00 AM',
    endTime: '12:00 PM',
    durationMinutes: 60,
    totalMarks: 50,
    marksPerQuestion: 25,
    eligibleClasses: ['Class 10', 'Class 11'],
    registrationOpensAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    registrationClosesAt: new Date(Date.now() - 12 * 24 * 3600 * 1000),
    negativeMarking: { enabled: true, deduction: 5 },
    tieBreakerRules: ['FINAL_SCORE', 'CORRECT_ANSWERS', 'INCORRECT_ANSWERS', 'SUBMISSION_TIME'],
    isPublicMeritListEnabled: false
  });

  // 6. Create Questions for Past Competition
  await Question.deleteMany({ competitionId: pastComp._id });
  const q1 = await Question.create({
    competitionId: pastComp._id,
    order: 1,
    prompt: 'भारत का राष्ट्रीय जलीय जीव कौन सा है?',
    options: [
      { key: 'A', text: 'गंगा डॉल्फिन' },
      { key: 'B', text: 'घड़ियाल' },
      { key: 'C', text: 'ब्लू व्हेल' },
      { key: 'D', text: 'कछुआ' }
    ],
    correctOption: 'A',
    marks: 25,
    negativeMarks: 5,
    isActive: true
  });

  const q2 = await Question.create({
    competitionId: pastComp._id,
    order: 2,
    prompt: 'यदि एक समकोण त्रिभुज का आधार 4 और लंब 3 हो, तो कर्ण का मान क्या होगा?',
    options: [
      { key: 'A', text: '6' },
      { key: 'B', text: '5' },
      { key: 'C', text: '7' },
      { key: 'D', text: '8' }
    ],
    correctOption: 'B',
    marks: 25,
    negativeMarks: 5,
    isActive: true
  });

  // 7. Registrations
  await Registration.deleteMany({ competitionId: { $in: [upcomingComp._id, pastComp._id] } });

  // Student A registrations
  const regAUpcoming = await Registration.create({
    studentId: studentA._id,
    competitionId: upcomingComp._id,
    rollNumber: '2026-1001',
    examMode: 'OMR',
    status: 'registered',
    omrSheetToken: 'OMR-2026-1001-HMAC-VERIFIED'
  });

  const regAPast = await Registration.create({
    studentId: studentA._id,
    competitionId: pastComp._id,
    rollNumber: '2025-0501',
    examMode: 'ONLINE_MCQ',
    status: 'registered'
  });

  // Student B registrations
  const regBUpcoming = await Registration.create({
    studentId: studentB._id,
    competitionId: upcomingComp._id,
    rollNumber: '2026-1002',
    examMode: 'ONLINE_MCQ',
    status: 'registered'
  });

  const regBPast = await Registration.create({
    studentId: studentB._id,
    competitionId: pastComp._id,
    rollNumber: '2025-0502',
    examMode: 'ONLINE_MCQ',
    status: 'registered'
  });

  // 8. Exam Attempts for Past Competition
  await Attempt.deleteMany({ competitionId: pastComp._id });

  // Pooja attempts both correctly (Score: 25 + 25 = 50)
  const attemptA = await Attempt.create({
    competitionId: pastComp._id,
    studentId: studentA._id,
    registrationId: regAPast._id,
    mode: 'ONLINE_MCQ',
    status: 'SUBMITTED',
    startedAt: new Date(pastExamDate.getTime() - 3600000),
    endsAt: new Date(pastExamDate.getTime() - 1800000),
    submittedAt: new Date(pastExamDate.getTime() - 2400000),
    timeTakenSeconds: 1200,
    questionSnapshot: [
      { questionId: q1._id, order: 1, prompt: q1.prompt, options: q1.options, marks: 25 },
      { questionId: q2._id, order: 2, prompt: q2.prompt, options: q2.options, marks: 25 }
    ],
    answers: [
      { questionId: q1._id, selectedOption: 'A' }, // Correct (+25)
      { questionId: q2._id, selectedOption: 'B' }  // Correct (+25)
    ]
  });

  // Amit attempts 1 correct, 1 wrong (Score: 25 - 5 = 20)
  const attemptB = await Attempt.create({
    competitionId: pastComp._id,
    studentId: studentB._id,
    registrationId: regBPast._id,
    mode: 'ONLINE_MCQ',
    status: 'SUBMITTED',
    startedAt: new Date(pastExamDate.getTime() - 3600000),
    endsAt: new Date(pastExamDate.getTime() - 1800000),
    submittedAt: new Date(pastExamDate.getTime() - 2000000),
    timeTakenSeconds: 1600,
    questionSnapshot: [
      { questionId: q1._id, order: 1, prompt: q1.prompt, options: q1.options, marks: 25 },
      { questionId: q2._id, order: 2, prompt: q2.prompt, options: q2.options, marks: 25 }
    ],
    answers: [
      { questionId: q1._id, selectedOption: 'A' }, // Correct (+25)
      { questionId: q2._id, selectedOption: 'C' }  // Incorrect (-5)
    ]
  });

  // 9. Run Central Scoring Engine
  await Result.deleteMany({ competitionId: pastComp._id });
  console.log('--- 2. RUNNING CENTRAL SCORING ENGINE ---');
  const evalResult = await evaluateCompetition({
    competitionId: pastComp._id.toString(),
    actor: committeeHead,
    reason: 'Initial evaluation for scholarship'
  });
  console.log(`Evaluated ${evalResult.evaluatedCount} attempts. Result status: EVALUATED.`);

  // 10. Committee Head Approves & Publishes Results
  pastComp.resultStatus = 'PUBLISHED';
  pastComp.isPublicMeritListEnabled = true;
  await pastComp.save();

  await Result.updateMany({ competitionId: pastComp._id }, { status: 'PUBLISHED', isPublicMeritListEnabled: true });
  console.log('--- 3. RESULTS OFFICIALLY APPROVED & PUBLISHED ---');

  const allResults = await Result.find({ competitionId: pastComp._id }).sort({ rank: 1 }).lean();
  allResults.forEach((r) => {
    console.log(`Rank #${r.rank}: ${r.studentName} | Score: ${r.finalScore}/${r.maximumMarks} (✓${r.correctAnswers}, ✗${r.incorrectAnswers})`);
  });

  console.log('\n--- REAL DATABASE SEEDING COMPLETED SUCCESSFULLY ---');
  await mongoose.disconnect();
}

seedAndAudit().catch((err) => {
  console.error('[SEED ERROR]', err);
  process.exit(1);
});
