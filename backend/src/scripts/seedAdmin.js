import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, normalizeIndianMobile } from '../models/user.model.js';
import { connectDB, disconnectDB } from '../config/database.js';

/**
 * CLI Command to seed / create the First Admin user.
 * Usage:
 *   node src/scripts/seedAdmin.js --mobile 9999999999 --name "Committee Head" --password "AdminPass123"
 *
 * Flags:
 *   --mobile, -m       : 10-digit Indian mobile number (or +91...)
 *   --name, -n         : Full name of Admin
 *   --password, -p     : Secure password (min 8 chars)
 *   --school           : Office / Institution (optional)
 *   --classGrade       : Designation (optional)
 *   --force            : Update existing admin password/details if already present
 */

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
    } else if (arg === '--school') {
      parsed.school = args[++i];
    } else if (arg === '--classGrade' || arg === '--designation') {
      parsed.classGrade = args[++i];
    } else if (arg === '--force') {
      parsed.force = true;
    }
  }

  // Fallback to environment variables if flags not supplied
  if (!parsed.mobile && process.env.ADMIN_MOBILE) parsed.mobile = process.env.ADMIN_MOBILE;
  if (!parsed.name && process.env.ADMIN_NAME) parsed.name = process.env.ADMIN_NAME;
  if (!parsed.password && process.env.ADMIN_PASSWORD) parsed.password = process.env.ADMIN_PASSWORD;

  return parsed;
}

async function run() {
  console.log('--- Education Committee Admin Provisioning CLI ---');
  const params = parseArgs();

  if (!params.mobile || !params.password) {
    console.error('[ERROR] Missing required parameters.');
    console.error('Usage:');
    console.error('  node src/scripts/seedAdmin.js --mobile <10-digits> --name "Full Name" --password "SecurePassword"');
    console.error('Options:');
    console.error('  --mobile, -m       10-digit mobile number [Required]');
    console.error('  --password, -p     Admin password (min 8 characters) [Required]');
    console.error('  --name, -n         Admin name [Default: "Education Committee Head"]');
    console.error('  --school           Office [Default: "Education Committee Central Office"]');
    console.error('  --classGrade       Designation [Default: "Head Administrator"]');
    console.error('  --force            Overwrite/update existing admin if mobile matches');
    process.exit(1);
  }

  const normalizedMobile = normalizeIndianMobile(params.mobile);
  if (!normalizedMobile) {
    console.error('[ERROR] Invalid mobile number. Must be a valid 10-digit Indian mobile number starting with 6-9.');
    process.exit(1);
  }

  if (typeof params.password !== 'string' || params.password.length < 8) {
    console.error('[ERROR] Password must be at least 8 characters long for admin accounts.');
    process.exit(1);
  }

  const adminName = (params.name && params.name.trim()) || 'Education Committee Head';
  const school = (params.school && params.school.trim()) || 'Education Committee Central Office';
  const classGrade = (params.classGrade && params.classGrade.trim()) || 'Head Administrator';

  try {
    await connectDB();

    // Check if an account already exists with this mobile
    const existing = await User.findOne({ mobileNormalized: normalizedMobile }).select('+passwordHash');

    if (existing) {
      if (!params.force) {
        console.warn(`[WARN] An account with mobile ${normalizedMobile} already exists.`);
        console.warn(`       Current Role: ${existing.role}, Name: ${existing.fullName}`);
        console.warn(`       To prevent accidental overwrites, use --force if you intentionally wish to update this account to Admin.`);
        await disconnectDB();
        process.exit(0);
      }

      // If force is passed, update account to Admin with new password hash
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(params.password, saltRounds);

      existing.fullName = adminName;
      existing.role = 'admin';
      existing.passwordHash = passwordHash;
      existing.school = school;
      existing.classOrGrade = classGrade;
      existing.isActive = true;
      await existing.save();

      console.log(`[SUCCESS] Existing user with mobile ${normalizedMobile} successfully updated to Admin role!`);
      console.log(`  Name: ${existing.fullName}`);
      console.log(`  Mobile: ${existing.mobileNormalized}`);
      console.log(`  Role: ${existing.role}`);
      console.log(`  Active: ${existing.isActive}`);
      await disconnectDB();
      process.exit(0);
    }

    // Hash password securely (NEVER print plaintext password)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(params.password, saltRounds);

    const newAdmin = await User.create({
      fullName: adminName,
      mobile: params.mobile.trim(),
      mobileNormalized: normalizedMobile,
      school,
      classOrGrade: classGrade,
      passwordHash,
      role: 'admin',
      isActive: true
    });

    console.log('[SUCCESS] First Admin account created successfully in MongoDB!');
    console.log(`  User ID: ${newAdmin._id}`);
    console.log(`  Name: ${newAdmin.fullName}`);
    console.log(`  Mobile: ${newAdmin.mobileNormalized}`);
    console.log(`  Role: ${newAdmin.role}`);
    console.log(`  Active: ${newAdmin.isActive}`);
    console.log('Security reminder: Plaintext passwords are never logged or stored.');

    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] Failed to seed admin:', err.message);
    try { await disconnectDB(); } catch {}
    process.exit(1);
  }
}

run();
