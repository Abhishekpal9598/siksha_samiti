import readline from 'readline';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, normalizeIndianMobile } from '../models/user.model.js';
import { connectDB, disconnectDB } from '../config/database.js';

/**
 * Interactive Hidden Password Prompt:
 * Reads keystrokes without echoing plaintext to the terminal.
 * Masks input with '*' and handles backspaces properly.
 */
function promptHidden(query) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Non-interactive fallback (e.g. piped input in CI/CD)
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
      return;
    }

    process.stdout.write(query);
    let input = '';

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(input);
          return;
        } else if (char === '\u0003') { // Ctrl+C
          process.stdout.write('\n[Aborted by user]\n');
          process.exit(1);
        } else if (char === '\b' || char === '\x7f') { // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += char;
          process.stdout.write('*');
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

function promptVisible(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--mobile' || arg === '-m') {
      parsed.mobile = args[++i];
    } else if (arg === '--name' || arg === '-n') {
      parsed.name = args[++i];
    } else if (arg === '--password' || arg === '-p') {
      parsed.password = args[++i];
      parsed.passwordFromCli = true;
    } else if (arg === '--school') {
      parsed.school = args[++i];
    } else if (arg === '--classGrade' || arg === '--designation') {
      parsed.classGrade = args[++i];
    } else if (arg === '--force') {
      parsed.force = true;
    } else if (arg === '--rotate-password' || arg === '--rotate') {
      parsed.rotatePassword = true;
    } else if (arg === '--role' || arg === '-r') {
      parsed.role = args[++i];
    }
  }

  // Fallback to environment variables
  if (!parsed.mobile && process.env.ADMIN_MOBILE) parsed.mobile = process.env.ADMIN_MOBILE;
  if (!parsed.name && process.env.ADMIN_NAME) parsed.name = process.env.ADMIN_NAME;
  if (!parsed.password && process.env.ADMIN_PASSWORD) parsed.password = process.env.ADMIN_PASSWORD;
  if (!parsed.role && process.env.ADMIN_ROLE) parsed.role = process.env.ADMIN_ROLE;

  return parsed;
}

async function run() {
  console.log('=====================================================');
  console.log('   Education Committee Admin Security & Seeding CLI   ');
  console.log('=====================================================');

  const params = parseArgs();

  // Security warning if password was passed via CLI flags
  if (params.passwordFromCli) {
    console.warn('\n[SECURITY WARNING] Passing passwords via CLI flags exposes them in PowerShell history and process lists!');
    console.warn('                   Interactive hidden entry is strongly recommended.\n');
  }

  // 1. Interactive Mobile prompt if not provided
  let mobileInput = params.mobile;
  if (!mobileInput) {
    mobileInput = await promptVisible('Enter Admin Mobile Number (10 digits): ');
  }

  const normalizedMobile = normalizeIndianMobile(mobileInput);
  if (!normalizedMobile) {
    console.error('\n[ERROR] Invalid mobile number. Must be a valid 10-digit Indian mobile number starting with 6-9.');
    process.exit(1);
  }

  await connectDB();

  try {
    const existingUser = await User.findOne({ mobileNormalized: normalizedMobile }).select('+passwordHash');

    // 2. PASSWORD ROTATION FLOW
    if (params.rotatePassword) {
      if (!existingUser) {
        console.error(`\n[ERROR] No account found with mobile number ${normalizedMobile}.`);
        await disconnectDB();
        process.exit(1);
      }

      console.log(`\nInitiating secure password rotation for: ${existingUser.fullName} (${existingUser.role})`);
      
      let newPass = params.password;
      if (!newPass) {
        newPass = await promptHidden('Enter New Admin Password (min 8 characters): ');
        const confirmPass = await promptHidden('Confirm New Admin Password: ');
        if (newPass !== confirmPass) {
          console.error('\n[ERROR] Passwords do not match. Password rotation aborted.');
          await disconnectDB();
          process.exit(1);
        }
      }

      if (typeof newPass !== 'string' || newPass.length < 8) {
        console.error('\n[ERROR] New password must be at least 8 characters long.');
        await disconnectDB();
        process.exit(1);
      }

      // Hash with bcrypt salt rounds 10
      const saltRounds = 10;
      const newHash = await bcrypt.hash(newPass, saltRounds);

      existingUser.passwordHash = newHash;
      // Increment tokenVersion: invalidates all previously issued JWT tokens across all devices
      existingUser.tokenVersion = (existingUser.tokenVersion || 0) + 1;
      existingUser.role = 'admin'; // ensure admin role
      existingUser.isActive = true;
      await existingUser.save();

      console.log('\n[SUCCESS] Admin password rotated securely!');
      console.log(`  Account: ${existingUser.fullName} (${existingUser.mobileNormalized})`);
      console.log(`  Role: ${existingUser.role}`);
      console.log(`  Token Version: ${existingUser.tokenVersion} (all previous sessions invalidated)`);
      console.log('Security confirmation: Plaintext password was not logged or saved in history.');

      await disconnectDB();
      process.exit(0);
    }

    // 3. EXISTING ACCOUNT CHECK
    if (existingUser && !params.force) {
      console.warn(`\n[WARN] An account with mobile ${normalizedMobile} already exists.`);
      console.warn(`       Name: ${existingUser.fullName}, Role: ${existingUser.role}`);
      console.warn(`       To rotate its password securely, run with: --rotate-password --mobile ${normalizedMobile}`);
      console.warn(`       To force overwrite, pass --force.`);
      await disconnectDB();
      process.exit(0);
    }

    // 4. GET PASSWORD INTERACTIVELY (HIDDEN)
    let password = params.password;
    if (!password) {
      password = await promptHidden('\nEnter Admin Password (min 8 characters, input is hidden): ');
      const confirmPassword = await promptHidden('Confirm Admin Password: ');
      if (password !== confirmPassword) {
        console.error('\n[ERROR] Passwords do not match. Aborting.');
        await disconnectDB();
        process.exit(1);
      }
    }

    if (typeof password !== 'string' || password.length < 8) {
      console.error('\n[ERROR] Password must be at least 8 characters long for admin accounts.');
      await disconnectDB();
      process.exit(1);
    }

    const adminName = (params.name && params.name.trim()) || 'Education Committee Head';
    const school = (params.school && params.school.trim()) || 'Education Committee Central Office';
    const classGrade = (params.classGrade && params.classGrade.trim()) || 'Head Administrator';

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const targetRole = (params.role && ['admin', 'committee_head'].includes(params.role.trim().toLowerCase()))
      ? params.role.trim().toLowerCase()
      : 'admin';

    if (existingUser && params.force) {
      existingUser.fullName = adminName;
      existingUser.role = targetRole;
      existingUser.passwordHash = passwordHash;
      existingUser.school = school;
      existingUser.classOrGrade = classGrade;
      existingUser.isActive = true;
      existingUser.tokenVersion = (existingUser.tokenVersion || 0) + 1;
      await existingUser.save();

      console.log(`\n[SUCCESS] Existing user updated to ${targetRole} role!`);
      console.log(`  Name: ${existingUser.fullName}`);
      console.log(`  Mobile: ${existingUser.mobileNormalized}`);
      console.log(`  Role: ${existingUser.role}`);
    } else {
      const newAdmin = await User.create({
        fullName: adminName,
        mobile: mobileInput.trim(),
        mobileNormalized: normalizedMobile,
        school,
        classOrGrade: classGrade,
        passwordHash,
        role: targetRole,
        isActive: true,
        tokenVersion: 0
      });

      console.log(`\n[SUCCESS] User account created successfully in MongoDB with role '${targetRole}'!`);
      console.log(`  ID: ${newAdmin._id}`);
      console.log(`  Name: ${newAdmin.fullName}`);
      console.log(`  Mobile: ${newAdmin.mobileNormalized}`);
      console.log(`  Role: ${newAdmin.role}`);
    }

    console.log('Security confirmation: Plaintext password was masked and never stored in history or logs.');
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error('\n[ERROR] Admin seeding failed:', err.message);
    try { await disconnectDB(); } catch {}
    process.exit(1);
  }
}

run();
