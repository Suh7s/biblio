import 'dotenv/config';
import mongoose from 'mongoose';
import { z } from 'zod';
import User from '../src/models/User.js';
const email = z.string().email().parse(process.argv[2]).toLowerCase();
if (!process.env.MONGODB_URI) throw new Error('Configure MONGODB_URI in backend/.env.');
try {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOneAndUpdate({ email }, { $set: { role: 'ADMIN' }, $inc: { tokenVersion: 1 } }, { new: true });
  if (!user) throw new Error('Register this account first. No account was created.');
  console.log('Administrator role granted. Sign in again to start a new session.');
} finally { await mongoose.disconnect(); }
