import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fail, required, validPhone } from '../domain/rules.js';

export function hashPassword(password) {
  if (String(password).length < 8) fail('Password must contain at least 8 characters');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export function createAuth(store) {
  return {
    login(email, password) {
      const user = store.one('SELECT * FROM users WHERE email=?', String(email || '').trim().toLowerCase());
      if (!user || !user.active || !verifyPassword(password || '', user.password_hash)) fail('Incorrect email or password', 401);
      return store.user(user.id);
    },
    register(input) {
      const email = required(input.email, 'Email').toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) fail('Invalid email address');
      if (store.one('SELECT id FROM users WHERE email=?', email)) fail('Email is already in use');
      const r = store.run('INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?,?)',
        required(input.name,'Name'), email, validPhone(input.phone), hashPassword(input.password), 'Sender');
      return store.user(r.lastInsertRowid);
    },
    createStaff(input) {
      const role = required(input.role,'Role');
      if (!['Dispatcher','Rider'].includes(role)) fail('Only Dispatcher or Rider accounts can be created');
      const email = required(input.email,'Email').toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) fail('Invalid email address');
      if (store.one('SELECT id FROM users WHERE email=?',email)) fail('This email already belongs to an account. Use Grant role to authorize the existing account.');
      store.run('INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?,?)',
        required(input.name,'Name'),email,validPhone(input.phone),hashPassword(input.password),role);
    }
  };
}
