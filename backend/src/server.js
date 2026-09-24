import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';

const port = process.env.PORT || 5000;
if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) throw new Error('MONGODB_URI and JWT_SECRET must be configured.');
await mongoose.connect(process.env.MONGODB_URI);
app.listen(port, () => console.log(`LibraMind API listening on ${port}`));
