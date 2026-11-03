import { fail, requireRole, required } from '../domain/rules.js';

export function createAdmin(store, auth) {
  return {
    createStaff(actor,input) { requireRole(actor,'Administrator'); auth.createStaff(input); },
    grantStaff(actor,input) {
      requireRole(actor,'Administrator');
      const role=required(input.role,'Role');
      if (!['Dispatcher','Rider'].includes(role)) fail('Only Dispatcher or Rider access can be granted');
      const email=required(input.email,'Email').toLowerCase();
      const user=store.one('SELECT id FROM users WHERE email=?',email);
      if (!user) fail('No account found for this email address');
      if (store.one('SELECT 1 FROM user_roles WHERE user_id=? AND role=?',user.id,role)) fail('This account already has the selected role');
      store.run('INSERT INTO user_roles(user_id,role) VALUES (?,?)',user.id,role);
      return store.user(user.id);
    },
    toggleStaff(actor,id) {
      requireRole(actor,'Administrator');
      const staff=store.user(Number(id));
      if (!staff || !staff.roles.some(role=>['Dispatcher','Rider'].includes(role))) fail('Staff member not found');
      store.run('UPDATE users SET active=? WHERE id=?',staff.active?0:1,staff.id);
    },
    createPoint(actor,input) {
      requireRole(actor,'Administrator');
      store.run('INSERT INTO storage_points(name,address) VALUES (?,?)',required(input.name,'Storage point name'),required(input.address,'Address'));
    },
    updatePoint(actor,id,input) {
      requireRole(actor,'Administrator');
      const point=store.one('SELECT * FROM storage_points WHERE id=?',Number(id));
      if (!point) fail('Storage point not found');
      store.run('UPDATE storage_points SET name=?,address=?,active=? WHERE id=?',required(input.name,'Name'),required(input.address,'Address'),input.active==='1'?1:0,point.id);
    }
  };
}
