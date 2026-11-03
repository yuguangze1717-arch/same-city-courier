import 'dotenv/config';
import { openDatabase } from './index.js';
import { createStore } from '../repositories/store.js';
import { hashPassword } from '../services/auth.js';

const store=createStore(openDatabase());
const users=[
  ['Alex Chan','sender@example.com','91234567','Sender'],
  ['Carmen Wong','dispatcher@example.com','92345678','Dispatcher'],
  ['Ryan Lau','rider@example.com','93456789','Rider'],
  ['System Administrator','admin@example.com','94567890','Administrator']
];
for (const [name,email,phone,role] of users) {
  const existing=store.one('SELECT id,name FROM users WHERE email=?',email);
  if (!existing)
    store.run('INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?,?)',name,email,phone,hashPassword('Demo1234!'),role);
  else if (existing.name.startsWith('Demo '))
    store.run('UPDATE users SET name=? WHERE id=?',name,existing.id);
}
for (const [name,address] of [['Central Parcel Hub','G/F, 10 Queen’s Road Central, Central'],['Kowloon Bay Collection Point','G/F, 12 Sheung Yuet Road, Kowloon Bay']]) {
  if (!store.one('SELECT id FROM storage_points WHERE name=?',name)) store.run('INSERT INTO storage_points(name,address) VALUES (?,?)',name,address);
}
console.log('Sample accounts and storage points ready. Initial password: Demo1234!');
store.db.close();
