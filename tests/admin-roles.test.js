import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/index.js';
import { createStore } from '../src/repositories/store.js';
import { createAuth, hashPassword } from '../src/services/auth.js';
import { createAdmin } from '../src/services/admin.js';
import { requireRole } from '../src/domain/rules.js';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('admin grants Rider and Dispatcher to a registered Sender without replacing the account',()=>{
  const db=openDatabase(':memory:');
  const store=createStore(db);
  const auth=createAuth(store);
  const admin=createAdmin(store,auth);
  store.run('INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?,?)','Admin','admin@test.com','91234567',hashPassword('password123'),'Administrator');
  const administrator=store.user(1);
  const sender=auth.register({name:'Existing Sender',email:'person@test.com',phone:'92345678',password:'senderpass123'});
  const before=store.one('SELECT password_hash FROM users WHERE id=?',sender.id).password_hash;

  assert.throws(()=>admin.grantStaff(sender,{email:'person@test.com',role:'Rider'}),/permission/);
  admin.grantStaff(administrator,{email:'PERSON@test.com',role:'Rider'});
  admin.grantStaff(administrator,{email:'person@test.com',role:'Dispatcher'});
  const updated=auth.login('person@test.com','senderpass123');
  assert.deepEqual(updated.roles,['Dispatcher','Rider','Sender']);
  for (const role of ['Sender','Dispatcher','Rider']) assert.doesNotThrow(()=>requireRole(updated,role));
  assert.throws(()=>requireRole(updated,'Administrator'),/permission/);
  assert.equal(store.one('SELECT password_hash FROM users WHERE id=?',sender.id).password_hash,before);
  assert.equal(store.one('SELECT COUNT(*) AS total FROM users WHERE email=?','person@test.com').total,1);
  assert.throws(()=>admin.grantStaff(administrator,{email:'person@test.com',role:'Administrator'}),/Only Dispatcher or Rider/);
  assert.throws(()=>admin.grantStaff(administrator,{email:'person@test.com',role:'Rider'}),/already has/);
  assert.throws(()=>admin.grantStaff(administrator,{email:'missing@test.com',role:'Rider'}),/No account found/);
  db.close();
});

test('new single-role accounts receive role memberships',()=>{
  const db=openDatabase(':memory:');
  const store=createStore(db);
  store.run('INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?,?)','Rider','rider@test.com','93456789','unused','Rider');
  assert.deepEqual(store.user(1).roles,['Rider']);
  db.close();
});

test('an existing database is backfilled with its original account roles',()=>{
  const folder=mkdtempSync(join(tmpdir(),'courier-roles-'));
  const path=join(folder,'legacy.sqlite');
  try {
    const legacy=new Database(path);
    legacy.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,phone TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO users(name,email,phone,password_hash,role) VALUES ('Existing Sender','sender@legacy.test','91234567','unused','Sender')");
    legacy.close();
    const db=openDatabase(path);
    assert.deepEqual(createStore(db).user(1).roles,['Sender']);
    db.close();
  } finally { rmSync(folder,{recursive:true,force:true}); }
});
