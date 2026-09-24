import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import { serverConfig } from './config/server.js';
import { expireReservations } from './services/circulation.js';

const config = serverConfig();
await mongoose.connect(config.MONGODB_URI);
const topology = await mongoose.connection.db.admin().command({ hello: 1 });
if (!topology.setName && topology.msg !== 'isdbgrid') {
  await mongoose.disconnect();
  throw new Error('biblio requires MongoDB Atlas or a replica set for inventory transactions. See docs/integration.md.');
}
// Unique indexes must exist before accepting concurrent borrowing/registration requests.
await Promise.all(Object.values(mongoose.models).map(model => model.init()));
let sweepRunning = false;
const sweep = async () => {
  if (sweepRunning) return;
  sweepRunning = true;
  try { await expireReservations(); }
  catch { console.error('Reservation expiration failed; it will be retried on the next sweep.'); }
  finally { sweepRunning = false; }
};
await sweep();
const timer = setInterval(sweep, config.RESERVATION_SWEEP_MS);
timer.unref();
const server = app.listen(config.PORT, () => console.log(`biblio API listening on ${config.PORT}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  clearInterval(timer);
  server.close(async () => { await mongoose.disconnect(); process.exit(0); });
});
