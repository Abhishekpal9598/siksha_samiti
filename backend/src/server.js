import app from './app.js';
import { config, validateProductionEnv } from './config/env.js';
import { connectDB, disconnectDB } from './config/database.js';
import { startAttemptExpirySweeper, stopAttemptExpirySweeper, sweepExpiredAttempts } from './services/examSweeper.service.js';

let server;

const startServer = async () => {
  try {
    // 0. Production Environment Security Validation
    validateProductionEnv();

    // 1. Connect to MongoDB
    await connectDB();

    // 2. Immediate Startup Reconciliation for any attempts that expired during downtime
    const reconciledCount = await sweepExpiredAttempts();
    if (reconciledCount > 0) {
      console.log(`[INFO] Server startup reconciliation: auto-submitted ${reconciledCount} expired exam attempt(s).`);
    }

    // 3. Start Periodic Exam Expiry Sweeper
    startAttemptExpirySweeper(15000);

    // 3. Start HTTP server
    server = app.listen(config.port, () => {
      console.log(`[INFO] Server running on port ${config.port} in ${config.nodeEnv} mode`);
      console.log(`[INFO] Health check available at: http://localhost:${config.port}${config.apiPrefix}/health`);
      console.log(`[INFO] Student registration at: http://localhost:${config.port}${config.apiPrefix}/auth/register`);
    });
  } catch (error) {
    console.error(`[FATAL] Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

const handleShutdown = async (signal) => {
  console.log(`[INFO] ${signal} signal received: closing HTTP server safely...`);
  stopAttemptExpirySweeper();
  if (server) {
    server.close(async () => {
      console.log('[INFO] HTTP server closed gracefully.');
      await disconnectDB();
      process.exit(0);
    });
  } else {
    await disconnectDB();
    process.exit(0);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startServer();
