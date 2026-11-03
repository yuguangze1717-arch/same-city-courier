import { fail, requireRole } from '../domain/rules.js';
import { DISTRICT_GROUPS } from '../domain/districts.js';
import { OrderValidationError, ORDER_FIELD_LABELS, ITEM_CATEGORIES } from '../domain/order-input.js';
import { quoteForWeight } from '../domain/pricing.js';

const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const must=(req,role)=>requireRole(req.user,role);
const go=(res,path)=>res.redirect(path);
const ORDER_GROUPS = [
  {key:'all',label:'All orders',statuses:null},
  {key:'payment',label:'Awaiting payment',statuses:['CREATED']},
  {key:'delivery',label:'In delivery',statuses:['PAID','ASSIGNED','PICKING_UP','PICKED_UP']},
  {key:'issue',label:'Delivery issue',statuses:['FAILED']},
  {key:'delivered',label:'Delivered',statuses:['DELIVERED']},
  {key:'cancelled',label:'Cancelled',statuses:['CANCELLED']}
];
export function registerRoutes(app,{store,auth,courier,admin}) {
  app.get('/',wrap((req,res)=>res.render('home',{title:'Track parcel',result:null})));
  app.post('/track',wrap((req,res)=>res.render('home',{title:'Track parcel',result:courier.track(req.body.tracking_no,req.body.last_four)})));
  app.get('/register',(req,res)=>res.render('register',{title:'Sender registration'}));
  app.post('/register',wrap((req,res)=>{ const user=auth.register(req.body); req.session.userId=user.id; go(res,'/sender'); }));
  app.get('/login',(req,res)=>res.render('login',{title:'Log in'}));
  app.post('/login',wrap((req,res)=>{ const user=auth.login(req.body.email,req.body.password); req.session.userId=user.id; go(res,'/dashboard'); }));
  app.post('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));
  app.get('/dashboard',wrap((req,res)=>{ if (!req.user) return go(res,'/login'); const role=['Sender','Dispatcher','Rider','Administrator'].find(item=>req.user.roles.includes(item)); go(res,({Sender:'/sender',Dispatcher:'/dispatcher',Rider:'/rider',Administrator:'/admin'})[role] || '/'); }));

  app.get('/sender',wrap((req,res)=>{ must(req,'Sender'); res.render('sender',{title:'Your delivery hub'}); }));
  app.get('/sender/quote',wrap((req,res)=>{ must(req,'Sender'); res.json(quoteForWeight(req.query.weight_kg)); }));
  app.get('/sender/orders/new',wrap((req,res)=>{ must(req,'Sender'); res.render('new-order',{title:'Create order',districtGroups:DISTRICT_GROUPS,itemCategories:ITEM_CATEGORIES,formValues:{},formErrors:{},fieldLabels:ORDER_FIELD_LABELS}); }));
  app.get('/sender/orders',wrap((req,res)=>{
    must(req,'Sender');
    const query=String(req.query.q || '').trim().toUpperCase().slice(0,40);
    const selected=ORDER_GROUPS.find(group=>group.key===req.query.type) || ORDER_GROUPS[0];
    store.all("SELECT * FROM orders WHERE sender_id=? AND status='CREATED' AND expires_at<=?",req.user.id,new Date().toISOString()).forEach(courier.expire);
    const search=query ? ' AND tracking_no LIKE ?' : '';
    const params=query ? [req.user.id,`%${query}%`] : [req.user.id];
    const counts=Object.fromEntries(store.all(`SELECT status,COUNT(*) AS count FROM orders WHERE sender_id=?${search} GROUP BY status`,...params).map(row=>[row.status,row.count]));
    const statusSql=selected.statuses ? ` AND status IN (${selected.statuses.map(()=>'?').join(',')})` : '';
    const orders=store.all(`SELECT * FROM orders WHERE sender_id=?${search}${statusSql} ORDER BY id DESC LIMIT 100`,...params,...(selected.statuses || []));
    const groups=ORDER_GROUPS.map(group=>({...group,count:group.statuses ? group.statuses.reduce((total,status)=>total+(counts[status] || 0),0) : Object.values(counts).reduce((total,count)=>total+count,0)}));
    res.render('my-orders',{title:'My orders',orders,query,groups,selected});
  }));
  app.post('/sender/orders',wrap((req,res)=>{
    must(req,'Sender');
    try { const order=courier.create(req.user,req.body); go(res,`/sender/orders/${order.id}`); }
    catch (error) {
      if (!(error instanceof OrderValidationError)) throw error;
      res.status(422).render('new-order',{title:'Create order',districtGroups:DISTRICT_GROUPS,itemCategories:ITEM_CATEGORIES,formValues:error.values,formErrors:error.errors,fieldLabels:ORDER_FIELD_LABELS});
    }
  }));
  app.get('/sender/orders/:id',wrap((req,res)=>{ must(req,'Sender'); const order=courier.get(req.params.id); if (order.sender_id!==req.user.id) fail('You cannot view this order',403); res.render('order',{title:'Order details',order:courier.expire(order),events:store.events(order.id),payment:store.one('SELECT * FROM payments WHERE order_id=?',order.id)}); }));
  app.post('/sender/orders/:id/pay',wrap((req,res)=>{ must(req,'Sender'); courier.mockPay(req.user,req.params.id); go(res,`/sender/orders/${req.params.id}`); }));
  app.post('/sender/orders/:id/cancel',wrap((req,res)=>{ must(req,'Sender'); courier.cancel(req.user,req.params.id); go(res,`/sender/orders/${req.params.id}`); }));

  app.get('/dispatcher',wrap((req,res)=>{ must(req,'Dispatcher'); res.render('dispatcher',{title:'Dispatch and exceptions',orders:store.all("SELECT o.*,u.name AS rider_name FROM orders o LEFT JOIN users u ON u.id=o.current_rider_id WHERE o.status IN ('PAID','ASSIGNED','PICKING_UP','FAILED') ORDER BY o.id DESC"),riders:store.all("SELECT id,name FROM users WHERE active=1 AND EXISTS (SELECT 1 FROM user_roles WHERE user_id=users.id AND role='Rider')"),points:store.all('SELECT * FROM storage_points WHERE active=1')}); }));
  app.post('/dispatcher/orders/:id/assign',wrap((req,res)=>{ must(req,'Dispatcher'); courier.assign(req.user,req.params.id,req.body.rider_id,req.body.reason); go(res,'/dispatcher'); }));
  app.post('/dispatcher/orders/:id/resolve',wrap((req,res)=>{ must(req,'Dispatcher'); courier.resolveFailure(req.user,req.params.id,req.body); go(res,'/dispatcher'); }));

  app.get('/rider',wrap((req,res)=>{ must(req,'Rider'); res.render('rider',{title:'My delivery tasks',orders:store.all("SELECT o.*,u.name AS sender_name,u.phone AS sender_phone FROM orders o JOIN users u ON u.id=o.sender_id WHERE o.current_rider_id=? AND o.status IN ('ASSIGNED','PICKING_UP','PICKED_UP','FAILED') ORDER BY o.id DESC",req.user.id),points:store.all('SELECT * FROM storage_points WHERE active=1')}); }));
  app.post('/rider/orders/:id/:action',wrap((req,res)=>{ must(req,'Rider'); courier.riderAction(req.user,req.params.id,req.params.action,req.body); go(res,'/rider'); }));

  app.get('/admin',wrap((req,res)=>{ must(req,'Administrator'); res.render('admin',{title:'Staff and storage points',granted:req.query.granted==='1',staff:store.all("SELECT u.id,u.name,u.email,u.phone,u.active,(SELECT GROUP_CONCAT(role, ', ') FROM user_roles WHERE user_id=u.id AND role IN ('Dispatcher','Rider')) AS staff_roles,(SELECT COUNT(*) FROM user_roles WHERE user_id=u.id AND role='Sender') AS is_sender FROM users u WHERE EXISTS (SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('Dispatcher','Rider')) ORDER BY u.id"),points:store.all('SELECT * FROM storage_points ORDER BY id')}); }));
  app.get('/admin/staff',wrap((req,res)=>{ must(req,'Administrator'); res.render('grant-staff',{title:'Authorize existing account'}); }));
  app.post('/admin/staff',wrap((req,res)=>{ admin.createStaff(req.user,req.body); go(res,'/admin'); }));
  app.post('/admin/staff/grant',wrap((req,res)=>{ admin.grantStaff(req.user,req.body); go(res,'/admin?granted=1'); }));
  app.post('/admin/staff/:id/toggle',wrap((req,res)=>{ admin.toggleStaff(req.user,req.params.id); go(res,'/admin'); }));
  app.post('/admin/points',wrap((req,res)=>{ admin.createPoint(req.user,req.body); go(res,'/admin'); }));
  app.post('/admin/points/:id',wrap((req,res)=>{ admin.updatePoint(req.user,req.params.id,req.body); go(res,'/admin'); }));
}
