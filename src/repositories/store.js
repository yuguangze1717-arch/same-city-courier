export function createStore(db) {
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  return { db, one, all, run,
    user: id => {
      const user=one('SELECT * FROM users WHERE id=?', id);
      return user ? {...user,roles:all('SELECT role FROM user_roles WHERE user_id=? ORDER BY role',user.id).map(row=>row.role)} : null;
    },
    order: id => one('SELECT * FROM orders WHERE id=?', id),
    orderByTracking: no => one('SELECT * FROM orders WHERE tracking_no=?', no),
    events: id => all('SELECT * FROM status_events WHERE order_id=? ORDER BY id', id),
    event(id, status, type, actorId, note='') {
      run('INSERT INTO status_events(order_id,status,event_type,actor_id,note) VALUES (?,?,?,?,?)', id,status,type,actorId,note);
    },
    transaction: fn => db.transaction(fn)()
  };
}
