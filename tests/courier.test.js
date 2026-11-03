import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/index.js';
import { createStore } from '../src/repositories/store.js';
import { createCourier } from '../src/services/courier.js';
import { createMockGateway } from '../src/services/payment.js';
import { OrderValidationError } from '../src/domain/order-input.js';
import { quoteForWeight } from '../src/domain/pricing.js';

const parcel = {item_category:'Clothing',item_description:'Two shirts in a box',weight_kg:'1.5'};

function setup() {
  const db=openDatabase(':memory:'); const store=createStore(db);
  for (const [id,role] of [[1,'Sender'],[2,'Dispatcher'],[3,'Rider'],[4,'Rider']])
    store.run('INSERT INTO users(id,name,email,phone,password_hash,role) VALUES (?,?,?,?,?,?)',id,role,`${id}@test.com`,'91234567','unused',role);
  store.run('INSERT INTO storage_points(name,address) VALUES (?,?)','Test Point','Central');
  const gateway=createMockGateway('test-secret');
  const courier=createCourier(store,gateway);
  const sender=store.user(1), dispatcher=store.user(2), rider=store.user(3);
  const order=courier.create(sender,{recipient_name:'Lee',recipient_phone:'98765432',pickup_district:'Central and Western',pickup_address:'1 Main St',dropoff_district:'Sha Tin',dropoff_address:'2 Station Road',...parcel});
  return {db,store,gateway,courier,sender,dispatcher,rider,order};
}
test('paid delivery path, limited tracking, and backend role checks',()=>{
  const x=setup(); const {courier,store,sender,dispatcher,rider,order}=x;
  assert.equal(store.order(order.id).pickup_district,'Central and Western');
  assert.equal(store.order(order.id).dropoff_address,'2 Station Road');
  assert.throws(()=>courier.assign(dispatcher,order.id,rider.id),/CREATED/);
  assert.throws(()=>courier.assign(sender,order.id,rider.id),/permission/);
  const receipt=x.gateway.pay(order.id,order.amount_cents);
  assert.throws(()=>courier.confirmPayment({...receipt,signature:'bad'}),/signature/);
  courier.confirmPayment(receipt); courier.confirmPayment(receipt);
  assert.equal(store.all("SELECT * FROM status_events WHERE event_type='payment.succeeded'").length,1);
  courier.assign(dispatcher,order.id,rider.id);
  assert.throws(()=>courier.riderAction(store.user(4),order.id,'depart'),/not assigned/);
  courier.riderAction(rider,order.id,'depart'); courier.riderAction(rider,order.id,'pickup');
  assert.throws(()=>courier.riderAction(rider,order.id,'deliver',{storage_point_id:999,evidence:'R1'}),/active storage point/);
  courier.riderAction(rider,order.id,'deliver',{storage_point_id:1,evidence:'R1'});
  assert.equal(courier.track(order.tracking_no,'5432').status,'DELIVERED');
  assert.equal(courier.track(order.tracking_no,'5432').point.name,'Test Point');
  assert.throws(()=>courier.track(order.tracking_no,'0000'),/No matching parcel found/);
  assert.equal(courier.track(order.tracking_no,'5432').recipient_phone,undefined);
  dbClose(x);
});
test('reassignment requires reason; FAILED remains pending until dispatcher resolution',()=>{
  const x=setup(); const {courier,store,dispatcher,rider,order,sender}=x;
  courier.mockPay(sender,order.id); courier.assign(dispatcher,order.id,rider.id);
  assert.throws(()=>courier.assign(dispatcher,order.id,4,''),/reassignment reason/);
  courier.assign(dispatcher,order.id,4,'Rider unavailable');
  assert.equal(store.all('SELECT * FROM assignments WHERE order_id=? AND ended_at IS NULL',order.id).length,1);
  const rider2=store.user(4); courier.riderAction(rider2,order.id,'depart'); courier.riderAction(rider2,order.id,'pickup');
  assert.throws(()=>courier.assign(dispatcher,order.id,rider.id,'late'),/PICKED_UP/);
  courier.riderAction(rider2,order.id,'fail',{reason:'Point closed'});
  assert.equal(store.order(order.id).status,'FAILED');
  courier.resolveFailure(dispatcher,order.id,{resolution:'CANCELLED',reason:'Cannot deliver'});
  assert.equal(store.order(order.id).status,'CANCELLED');
  assert.equal(store.one('SELECT status FROM payments WHERE order_id=?',order.id).status,'refund_pending');
  dbClose(x);
});
test('quote expires before late payment confirmation',()=>{
  let time=new Date('2026-11-03T00:00:00Z'); const db=openDatabase(':memory:'); const store=createStore(db);
  store.run('INSERT INTO users(id,name,email,phone,password_hash,role) VALUES (1,?,?,?,?,?)','Sender','s@test.com','91234567','unused','Sender');
  const gateway=createMockGateway('test'); const courier=createCourier(store,gateway,()=>time);
  const order=courier.create(store.user(1),{recipient_name:'Lee',recipient_phone:'98765432',pickup_district:'Eastern',pickup_address:'A',dropoff_district:'Kowloon City',dropoff_address:'B',...parcel});
  time=new Date('2026-11-03T00:16:00Z');
  assert.throws(()=>courier.confirmPayment(gateway.pay(order.id,order.amount_cents)),/CANCELLED/);
  assert.equal(store.order(order.id).status,'CANCELLED');
  db.close();
});
function dbClose(x){x.db.close();}
test('districts must match the Hong Kong district list',()=>{
  const x=setup();
  assert.throws(()=>x.courier.create(x.sender,{recipient_name:'Lee',recipient_phone:'98765432',pickup_district:'Central',pickup_address:'1 Main St',dropoff_district:'Sha Tin',dropoff_address:'2 Station Road',...parcel}),error=>{
    assert.ok(error instanceof OrderValidationError);
    assert.match(error.errors.pickup_district,/valid pickup district/);
    return true;
  });
  assert.equal(x.store.all('SELECT id FROM orders').length,1);
  dbClose(x);
});
test('missing order fields produce specific errors without creating an order',()=>{
  const x=setup();
  assert.throws(()=>x.courier.create(x.sender,{recipient_name:'Lee',recipient_phone:'bad'}),error=>{
    assert.ok(error instanceof OrderValidationError);
    assert.deepEqual(Object.keys(error.errors),['pickup_district','dropoff_district','pickup_address','dropoff_address','item_category','item_description','weight_kg','recipient_phone']);
    assert.match(error.errors.recipient_phone,/8–15 digits/);
    return true;
  });
  assert.equal(x.store.all('SELECT id FROM orders').length,1);
  dbClose(x);
});
test('weight tiers round up and server controls order and payment price',()=>{
  assert.deepEqual([0.4,1,1.01,5,5.01].map(weight=>quoteForWeight(weight).amountCents),[3500,3500,4200,9100,10300]);
  assert.equal(quoteForWeight('1.01').chargeableGrams,1500);
  assert.equal(quoteForWeight('5.01').chargeableGrams,6000);
  assert.throws(()=>quoteForWeight('20.01'),/between 0.01 and 20 kg/);
  const x=setup();
  const order=x.courier.create(x.sender,{recipient_name:'Lee',recipient_phone:'98765432',pickup_district:'Eastern',pickup_address:'A',dropoff_district:'Kowloon City',dropoff_address:'B',...parcel,weight_kg:'5.01',amount_cents:1});
  assert.equal(order.amount_cents,10300);
  assert.equal(order.weight_grams,5010);
  assert.equal(order.chargeable_grams,6000);
  assert.equal(order.item_category,'Clothing');
  assert.equal(x.store.one('SELECT amount_cents FROM payments WHERE order_id=?',order.id).amount_cents,10300);
  x.courier.mockPay(x.sender,order.id);
  assert.equal(x.store.order(order.id).status,'PAID');
  dbClose(x);
});
test('sender cancels before payment without a refund',()=>{
  const x=setup();
  assert.throws(()=>x.courier.cancel(x.dispatcher,x.order.id),/permission/);
  x.courier.cancel(x.sender,x.order.id);
  assert.equal(x.store.order(x.order.id).status,'CANCELLED');
  assert.equal(x.store.one('SELECT status,refund_ref FROM payments WHERE order_id=?',x.order.id).status,'pending');
  assert.throws(()=>x.courier.mockPay(x.sender,x.order.id),/CANCELLED/);
  dbClose(x);
});
test('sender cancellation after assignment gives a mock refund and removes the rider task',()=>{
  const x=setup();
  x.courier.mockPay(x.sender,x.order.id);
  x.courier.assign(x.dispatcher,x.order.id,x.rider.id);
  x.courier.riderAction(x.rider,x.order.id,'depart');
  x.courier.cancel(x.sender,x.order.id);
  const order=x.store.order(x.order.id);
  const payment=x.store.one('SELECT * FROM payments WHERE order_id=?',order.id);
  assert.equal(order.status,'CANCELLED');
  assert.equal(order.current_rider_id,null);
  assert.equal(payment.status,'refunded');
  assert.match(payment.refund_ref,/^mock-refund-/);
  assert.ok(payment.refunded_at);
  assert.equal(x.store.all('SELECT * FROM assignments WHERE order_id=? AND ended_at IS NULL',order.id).length,0);
  assert.throws(()=>x.courier.riderAction(x.rider,order.id,'pickup'),/not assigned/);
  assert.throws(()=>x.courier.cancel(x.sender,order.id),/CANCELLED/);
  dbClose(x);
});
test('cancellation is rejected after pickup and for another sender',()=>{
  const x=setup();
  x.store.run('INSERT INTO users(name,email,phone,password_hash,role) VALUES (?,?,?,?,?)','Other Sender','other@test.com','91234567','unused','Sender');
  assert.throws(()=>x.courier.cancel(x.store.user(5),x.order.id),/permission/);
  x.courier.mockPay(x.sender,x.order.id);
  x.courier.assign(x.dispatcher,x.order.id,x.rider.id);
  x.courier.riderAction(x.rider,x.order.id,'depart');
  x.courier.riderAction(x.rider,x.order.id,'pickup');
  assert.throws(()=>x.courier.cancel(x.sender,x.order.id),/PICKED_UP/);
  assert.equal(x.store.one('SELECT status FROM payments WHERE order_id=?',x.order.id).status,'succeeded');
  dbClose(x);
});
