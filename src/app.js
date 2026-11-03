import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDatabase } from './db/index.js';
import { createStore } from './repositories/store.js';
import { createAuth } from './services/auth.js';
import { createMockGateway } from './services/payment.js';
import { createCourier } from './services/courier.js';
import { createAdmin } from './services/admin.js';
import { registerRoutes } from './routes/web.js';
import { BusinessError } from './domain/rules.js';

const base=dirname(fileURLToPath(import.meta.url));
export function createApp(options={}) {
  const db=options.db || openDatabase();
  const store=createStore(db);
  const auth=createAuth(store);
  const admin=createAdmin(store,auth);
  const courier=createCourier(store,createMockGateway(options.paymentSecret || process.env.PAYMENT_SECRET || 'demo-payment-secret'),options.now);
  const app=express();
  app.set('view engine','ejs'); app.set('views',join(base,'views'));
  app.use(express.urlencoded({extended:false}));
  app.use(express.static(join(base,'public')));
  app.use(session({secret:options.sessionSecret || process.env.SESSION_SECRET || 'demo-session-secret',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:false,maxAge:8*60*60*1000}}));
  app.use((req,res,next)=>{
    req.user=req.session.userId ? store.user(req.session.userId):null;
    if (req.user && !req.user.active) { req.session.destroy(()=>{}); req.user=null; }
    req.session.csrf ||= randomBytes(24).toString('hex');
    res.locals.user=req.user; res.locals.csrf=req.session.csrf; res.locals.error=null;
    next();
  });
  app.use((req,res,next)=>{
    if (req.method!=='POST') return next();
    const expected=Buffer.from(req.session.csrf,'utf8');
    const actual=Buffer.from(String(req.body._csrf||''),'utf8');
    if (expected.length!==actual.length || !timingSafeEqual(expected,actual)) return next(new BusinessError('Form expired. Please refresh the page.',403));
    next();
  });
  registerRoutes(app,{store,auth,courier,admin});
  app.use((err,req,res,next)=>{
    if (res.headersSent) return next(err);
    const status=err instanceof BusinessError ? err.status : 500;
    if (status===500) console.error(err);
    res.status(status).render('message',{title:'Action could not be completed',message:status===500?'An unexpected server error occurred':err.message});
  });
  return {app,db,store,auth,courier};
}
