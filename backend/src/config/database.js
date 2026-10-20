import mongoose from 'mongoose';
import { config } from './env.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 5000
    });

    console.log(`[INFO] MongoDB Connected: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[ERROR] MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('[INFO] MongoDB Disconnected gracefully.');
  } catch (error) {
    console.error(`[ERROR] MongoDB Disconnect Error: ${error.message}`);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[WARN] MongoDB connection lost.');
});

mongoose.connection.on('reconnected', () => {
  console.log('[INFO] MongoDB reconnected.');
});

mongoose.connection.on('error', (err) => {
  console.error(`[ERROR] MongoDB runtime error: ${err.message}`);
});
