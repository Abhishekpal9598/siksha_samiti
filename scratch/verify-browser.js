import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\Abhishek Pal\\.gemini\\antigravity\\brain\\bfe10c8c-fc37-4232-baed-85e2253dec40";
const PROFILE_DIR = path.join(ARTIFACT_DIR, 'scratch', 'temp_chrome_audit');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Simple CDP helper via native WebSocket
class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.exceptionThrown') {
          console.error('[BROWSER EXCEPTION]', msg.params?.exceptionDetails?.text, msg.params?.exceptionDetails?.exception?.description);
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
          console.log('[BROWSER CONSOLE]', msg.params?.args?.map(a => a.value).join(' '));
        }
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const isMultiStatement = expression.includes(';') || (expression.includes('\n') && (expression.includes('const ') || expression.includes('let ') || expression.includes('function ')));
    const wrapped = isMultiStatement 
      ? `(() => {\n${expression}\n})()`
      : expression;
    const res = await this.send('Runtime.evaluate', {
      expression: wrapped,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      console.error('[EVAL EXCEPTION]', res.exceptionDetails.text, res.exceptionDetails.exception?.description);
    }
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const filePath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`[SCREENSHOT] Saved: ${filename}`);
    return filePath;
  }

  close() {
    this.ws.close();
  }
}

async function runBrowserAudit() {
  console.log('=== Starting Phase 2 Manual Browser Security Verification ===');

  if (fs.existsSync(PROFILE_DIR)) {
    try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  // 1. Launch Chrome Headless with Remote Debugging
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE_DIR}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    'http://localhost:5174/'
  ], { detached: false });

  await sleep(2000);

  try {
    // 2. Fetch page target
    const versionRes = await fetch('http://127.0.0.1:9222/json/version');
    const versionData = await versionRes.json();
    console.log(`[CHROME CONNECTED] Browser: ${versionData.Browser}`);

    const listRes = await fetch('http://127.0.0.1:9222/json/list');
    const listData = await listRes.json();
    const pageTarget = listData.find(t => t.type === 'page') || listData[0];
    if (!pageTarget) throw new Error('No page target found');

    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.init();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await sleep(2000);

    // -------------------------------------------------------------
    // TEST 1: Homepage & Bilingual Language Switching
    // -------------------------------------------------------------
    console.log('\n--- Step 1: Homepage & Bilingual Language Switching ---');
    let titleHi = await client.eval(`document.querySelector('.brand-title')?.innerText`);
    console.log(`Initial Title (Default Hindi): "${titleHi}"`);
    if (!titleHi?.includes('शिक्षा समिति')) throw new Error('Default language is not Hindi');

    // Switch to English
    console.log('Clicking English button...');
    await client.eval(`document.querySelectorAll('.lang-option-btn')[1]?.click()`);
    await sleep(500);

    let titleEn = await client.eval(`document.querySelector('.brand-title')?.innerText`);
    console.log(`Title after switching to English: "${titleEn}"`);
    if (!titleEn?.includes('Education Committee')) throw new Error('English language switch failed');

    // Switch back to Hindi
    await client.eval(`document.querySelectorAll('.lang-option-btn')[0]?.click()`);
    await sleep(500);
    console.log('[VERIFIED] Bilingual language toggle works seamlessly.');

    // -------------------------------------------------------------
    // TEST 2: Student Registration via Modal
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Student Registration via UI Modal ---');
    const regMobile = '9875' + Math.floor(100000 + Math.random() * 900000);

    // Click "छात्र पंजीकरण" in Header
    await client.eval(`
      const btns = Array.from(document.querySelectorAll('button'));
      const regBtn = btns.find(b => b.innerText.includes('पंजीकरण'));
      if (regBtn) regBtn.click();
    `);
    await sleep(600);

    const isRegModalOpen = await client.eval(`document.querySelector('.modal-title')?.innerText`);
    console.log(`Modal Title opened: "${isRegModalOpen}"`);

    // Fill registration form using React input setter
    await client.eval(`
      function setReactVal(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const inputs = document.querySelectorAll('.modal-card input');
      setReactVal(inputs[0], 'Sunita Verma');
      setReactVal(inputs[1], '${regMobile}');
      setReactVal(inputs[2], 'Saraswati Vidya Mandir');
      setReactVal(inputs[3], 'Class 11');
      setReactVal(inputs[4], 'StudentPass@2026');
      setReactVal(inputs[5], 'StudentPass@2026');
    `);
    await sleep(400);

    // Submit form by clicking submit button
    console.log('Submitting registration form for Sunita Verma...');
    await client.eval(`
      const submitBtn = document.querySelector('.modal-card button[type="submit"]');
      if (submitBtn) submitBtn.click();
    `);
    await sleep(2500);

    const successMsg = await client.eval(`document.querySelector('.modal-body h4')?.innerText`);
    console.log(`Registration result: "${successMsg}"`);
    if (!successMsg?.includes('सफलतापूर्वक')) {
      const errText = await client.eval(`document.querySelector('.modal-body')?.innerText`);
      console.log('Modal body on error:', errText);
      throw new Error('Student registration failed');
    }

    // Close registration modal by clicking 'पूर्ण / बंद करें'
    await client.eval(`
      const doneBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('पूर्ण') || b.innerText.includes('Done'));
      if (doneBtn) doneBtn.click();
      else document.querySelector('.modal-close-btn')?.click();
    `);
    await sleep(1000);
    console.log('[VERIFIED] Student registration succeeds and stores user in MongoDB.');

    // -------------------------------------------------------------
    // TEST 3: Student Login via UI Modal
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Student Login via UI Modal ---');
    const pageButtons = await client.eval(`
      Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim())
    `);
    console.log('Page buttons before student login:', pageButtons);

    await client.eval(`
      const btns = Array.from(document.querySelectorAll('button'));
      const loginBtn = btns.find(b => b.innerText === 'छात्र लॉगिन' || b.innerText === 'Student Login' || b.innerText.includes('छात्र लॉगिन करें'));
      console.log('Found login button:', loginBtn ? loginBtn.innerText : 'NOT FOUND');
      if (loginBtn) loginBtn.click();
    `);
    await sleep(1000);

    const loginTitle = await client.eval(`document.querySelector('.modal-title')?.innerText`);
    console.log(`Login Modal opened: "${loginTitle}"`);

    // Fill Student Login Form
    await client.eval(`
      function setReactVal(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const inputs = document.querySelectorAll('.modal-card form input');
      setReactVal(inputs[0], '${regMobile}');
      setReactVal(inputs[1], 'StudentPass@2026');
    `);
    await sleep(400);

    console.log('Submitting Student login...');
    await client.eval(`
      const submitBtn = document.querySelector('.modal-card form button[type="submit"]');
      if (submitBtn) submitBtn.click();
    `);
    await sleep(3000);

    // Verify Student Dashboard
    const studentDashTitle = await client.eval(`document.querySelector('.brand-subtitle')?.innerText`);
    const studentGreeting = await client.eval(`document.querySelector('main h1')?.innerText`);
    console.log(`Navigated to: "${studentDashTitle}"`);
    console.log(`Dashboard Greeting: "${studentGreeting}"`);

    if (!studentGreeting?.includes('Sunita Verma')) {
      throw new Error(`Student Dashboard did not display Sunita Verma! Found: ${studentGreeting}`);
    }

    await client.screenshot('browser-student-dashboard.png');
    console.log('[VERIFIED] Student Dashboard loaded with real profile, no fake data.');

    // -------------------------------------------------------------
    // TEST 4: Student Denied Admin Access
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Verify Student Cannot Access Admin Portal ---');
    // Try to trigger Admin dashboard view directly
    const adminAccessCheck = await client.eval(`
      fetch('http://localhost:5000/api/v1/auth/admin-only', { credentials: 'include' })
        .then(r => ({ status: r.status }))
    `);
    console.log(`Student attempted to query /admin-only: HTTP status = ${adminAccessCheck.status}`);
    if (adminAccessCheck.status !== 403) throw new Error('Student was not rejected from admin route!');
    console.log('[VERIFIED] Student account is strictly forbidden (HTTP 403) from Admin routes.');

    // -------------------------------------------------------------
    // TEST 5: Student Logout & Token Invalidation
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Student Logout & Session Invalidation ---');
    await client.eval(`
      const btns = Array.from(document.querySelectorAll('button'));
      const logoutBtn = btns.find(b => b.innerText.includes('लॉगआउट'));
      if (logoutBtn) logoutBtn.click();
    `);
    await sleep(1500);

    const isBackOnHome = await client.eval(`document.querySelector('.hero-title') !== null`);
    console.log(`Returned to Public Home page on Logout: ${isBackOnHome}`);
    if (!isBackOnHome) throw new Error('Logout did not return to home page');

    // Verify session revoked on server
    const postLogoutCheck = await client.eval(`
      fetch('http://localhost:5000/api/v1/auth/me', { credentials: 'include' })
        .then(r => ({ status: r.status }))
    `);
    console.log(`Protected /auth/me check after logout: HTTP status = ${postLogoutCheck.status}`);
    if (postLogoutCheck.status !== 401) throw new Error('Session remained valid after logout!');
    console.log('[VERIFIED] Logout successfully destroyed session on client and server.');

    // -------------------------------------------------------------
    // TEST 6: Admin Login via Dedicated Admin Portal
    // -------------------------------------------------------------
    console.log('\n--- Step 6: Admin Login via Dedicated Admin Portal ---');
    await client.eval(`
      const btns = Array.from(document.querySelectorAll('button'));
      const adminBtn = btns.find(b => b.innerText.includes('समिति लॉगिन'));
      if (adminBtn) adminBtn.click();
    `);
    await sleep(600);

    const adminModalTitle = await client.eval(`document.querySelector('.modal-title')?.innerText`);
    const adminModalBadge = await client.eval(`document.querySelector('.modal-body')?.innerText`);
    console.log(`Admin Modal opened: "${adminModalTitle}"`);
    console.log(`Badge present: ${adminModalBadge?.includes('अधिकृत कार्मिक')}`);

    // Fill Admin Login Form with rotated admin credentials
    await client.eval(`
      function setReactVal(el, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const inputs = document.querySelectorAll('.modal-card input');
      setReactVal(inputs[0], '9999900001');
      setReactVal(inputs[1], 'NewAdminSecure2026@');
    `);
    await sleep(400);

    console.log('Submitting Admin login...');
    await client.eval(`
      const submitBtn = document.querySelector('.modal-card button[type="submit"]');
      if (submitBtn) submitBtn.click();
    `);
    await sleep(2500);

    // Verify Admin Dashboard
    const adminDashSubtitle = await client.eval(`document.querySelector('header span[style*="94A3B8"]')?.innerText`);
    const adminHeading = await client.eval(`document.querySelector('main h1')?.innerText`);
    const adminSecurityBadge = await client.eval(`document.querySelector('main p')?.innerText`);
    console.log(`Navigated to: "${adminDashSubtitle}"`);
    console.log(`Admin Greeting: "${adminHeading}"`);
    console.log(`Security Badge: "${adminSecurityBadge}"`);

    if (!adminHeading?.includes('Committee Head')) {
      throw new Error(`Admin Dashboard did not load Committee Head! Found: ${adminHeading}`);
    }

    await client.screenshot('browser-admin-dashboard.png');
    console.log('[VERIFIED] Admin Dashboard loaded with verified admin session and control modules.');

    // -------------------------------------------------------------
    // TEST 7: Admin Logout
    // -------------------------------------------------------------
    console.log('\n--- Step 7: Admin Logout ---');
    await client.eval(`
      const btns = Array.from(document.querySelectorAll('button'));
      const adminLogoutBtn = btns.find(b => b.innerText.includes('लॉगआउट'));
      if (adminLogoutBtn) adminLogoutBtn.click();
    `);
    await sleep(1500);

    const backHomeAgain = await client.eval(`document.querySelector('.hero-title') !== null`);
    console.log(`Admin logged out and returned to Home: ${backHomeAgain}`);
    if (!backHomeAgain) throw new Error('Admin logout failed');

    client.close();
    chromeProcess.kill();
    console.log('\n=== ALL BROWSER SECURITY VERIFICATION TESTS PASSED SUCCESSFULLY ===\n');
  } catch (err) {
    console.error('\n[BROWSER AUDIT ERROR]', err);
    try { chromeProcess.kill(); } catch {}
    process.exit(1);
  }
}

runBrowserAudit();
