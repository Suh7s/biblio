import User from '../../src/models/User.js';
import { startFixture, Client, password } from './fixture.js';
process.env.CLIENT_ORIGIN = 'http://127.0.0.1:5175';
const fixture = await startFixture(5005);
const client = new Client(fixture.base);
await client.post('/auth/register', { name: 'Browser Administrator', email: 'browser-admin@integration.test', password });
await User.updateOne({ email: 'browser-admin@integration.test' }, { role: 'ADMIN' });
console.log('Isolated browser integration API ready on 5005.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await fixture.close(); process.exit(0); });
