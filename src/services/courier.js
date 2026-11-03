import { randomBytes } from 'node:crypto';
import { fail, requireRole, requireStatus, required } from '../domain/rules.js';
import { validateOrderInput } from '../domain/order-input.js';
import { quoteForWeight } from '../domain/pricing.js';

export function createCourier(store, gateway, now = () => new Date()) {
  const stamp = () => now().toISOString();
  const change = (order, status, type, actor, note='') => {
    store.run('UPDATE orders SET status=? WHERE id=?',status,order.id);
    store.event(order.id,status,type,actor?.id ?? null,note);
  };
  const get = id => { const order=store.order(Number(id)); if (!order) fail('Order not found',404); return order; };
  const expire = order => {
    if (order.status === 'CREATED' && now().getTime() >= Date.parse(order.expires_at)) {
      change(order,'CANCELLED','order.expire',null,'PAYMENT_TIMEOUT');
      return store.order(order.id);
    }
    return order;
  };
  const actorOrder = (actor,id) => { const o=get(id); if (o.sender_id !== actor.id) fail('You do not have permission to view this order',403); return o; };
  return {
    get, expire,
    create(actor,input) {
      requireRole(actor,'Sender');
      const values=validateOrderInput(input);
      const recipientName=values.recipient_name;
      const recipientPhone=values.recipient_phone;
      const pickupDistrict=values.pickup_district;
      const pickup=values.pickup_address;
      const district=values.dropoff_district;
      const destination=values.dropoff_address;
      const price=quoteForWeight(values.weight_kg);
      const no='HK'+Date.now().toString(36).toUpperCase()+randomBytes(3).toString('hex').toUpperCase();
      const expires=new Date(now().getTime()+15*60_000).toISOString();
      return store.transaction(() => {
        const result=store.run('INSERT INTO orders(tracking_no,sender_id,recipient_name,recipient_phone,pickup_district,pickup_address,dropoff_district,dropoff_address,item_category,item_description,weight_grams,chargeable_grams,status,amount_cents,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          no,actor.id,recipientName,recipientPhone,pickupDistrict,pickup,district,destination,values.item_category,values.item_description,price.weightGrams,price.chargeableGrams,'CREATED',price.amountCents,expires);
        const id=Number(result.lastInsertRowid);
        store.run('INSERT INTO payments(order_id,status,amount_cents) VALUES (?,?,?)',id,'pending',price.amountCents);
        store.event(id,'CREATED','order.create',actor.id);
        return store.order(id);
      });
    },
    mockPay(actor,id) {
      requireRole(actor,'Sender');
      const order=actorOrder(actor,id);
      return this.confirmPayment(gateway.pay(order.id,order.amount_cents));
    },
    cancel(actor,id) {
      requireRole(actor,'Sender');
      expire(actorOrder(actor,id));
      return store.transaction(() => {
        const order=actorOrder(actor,id);
        requireStatus(order,'CREATED','PAID','ASSIGNED','PICKING_UP');
        const payment=store.one('SELECT * FROM payments WHERE order_id=?',order.id);
        if (order.status==='CREATED') {
          if (payment.status!=='pending') fail('Payment state does not allow cancellation');
        } else {
          if (payment.status!=='succeeded') fail('Payment state does not allow a refund');
          const refund=gateway.refund(order.id,order.amount_cents);
          store.run("UPDATE payments SET status='refunded',refund_ref=?,refunded_at=? WHERE order_id=?",refund.ref,stamp(),order.id);
        }
        if (order.current_rider_id) {
          store.run('UPDATE assignments SET ended_at=? WHERE order_id=? AND ended_at IS NULL',stamp(),order.id);
          store.run('UPDATE orders SET current_rider_id=NULL WHERE id=?',order.id);
        }
        change(order,'CANCELLED','order.cancel',actor,payment.status==='pending'?'Cancelled before payment':'Mock refund completed');
        return store.order(order.id);
      });
    },
    confirmPayment(payload) {
      gateway.verify(payload);
      // Persist expiry independently: a rejected late payment must not roll back cancellation.
      expire(get(payload.orderId));
      return store.transaction(() => {
        const order=get(payload.orderId);
        const payment=store.one('SELECT * FROM payments WHERE order_id=?',order.id);
        if (payment.status==='succeeded' && payment.provider_ref===payload.ref) return order;
        requireStatus(order,'CREATED');
        if (Number(payload.amount)!==order.amount_cents || payment.amount_cents!==order.amount_cents) fail('Payment amount does not match');
        if (payment.status!=='pending') fail('Payment status cannot be confirmed');
        store.run('UPDATE payments SET status=?,provider_ref=?,paid_at=? WHERE order_id=?','succeeded',payload.ref,stamp(),order.id);
        change(order,'PAID','payment.succeeded',null,`Mock ref ${payload.ref}`);
        return store.order(order.id);
      });
    },
    assign(actor,id,riderId,reason) {
      requireRole(actor,'Dispatcher');
      return store.transaction(() => {
        const order=get(id); const rider=store.user(Number(riderId));
        if (!rider || !rider.roles.includes('Rider') || !rider.active) fail('Select an active Rider');
        if (order.status==='PAID') {
          store.run('INSERT INTO assignments(order_id,rider_id,reason,assigned_by) VALUES (?,?,?,?)',order.id,rider.id,'Initial assignment',actor.id);
          store.run('UPDATE orders SET current_rider_id=? WHERE id=?',rider.id,order.id);
          change(order,'ASSIGNED','dispatch.assign',actor,`Rider ${rider.name}`);
        } else {
          requireStatus(order,'ASSIGNED','PICKING_UP');
          const why=required(reason,'reassignment reason');
          if (order.current_rider_id===rider.id) fail('Choose a different Rider');
          store.run('UPDATE assignments SET ended_at=? WHERE order_id=? AND ended_at IS NULL',stamp(),order.id);
          store.run('INSERT INTO assignments(order_id,rider_id,reason,assigned_by) VALUES (?,?,?,?)',order.id,rider.id,why,actor.id);
          store.run('UPDATE orders SET current_rider_id=?,status=? WHERE id=?',rider.id,'ASSIGNED',order.id);
          store.event(order.id,'ASSIGNED','dispatch.reassign',actor.id,why);
        }
        return store.order(order.id);
      });
    },
    riderAction(actor,id,action,input={}) {
      requireRole(actor,'Rider');
      return store.transaction(() => {
        const order=get(id);
        if (order.current_rider_id!==actor.id) fail('This task is not assigned to you',403);
        if (action==='depart') { requireStatus(order,'ASSIGNED'); change(order,'PICKING_UP','rider.depart',actor); }
        else if (action==='pickup') { requireStatus(order,'PICKING_UP'); change(order,'PICKED_UP','pickup.confirm',actor); }
        else if (action==='deliver') {
          requireStatus(order,'PICKED_UP');
          const point=store.one('SELECT * FROM storage_points WHERE id=? AND active=1',Number(input.storage_point_id));
          if (!point) fail('Select an active storage point');
          const evidence=required(input.evidence,'delivery evidence');
          store.run('UPDATE orders SET storage_point_id=? WHERE id=?',point.id,order.id);
          change(order,'DELIVERED','delivery.dropoff',actor,`Storage point ${point.name}; Evidence: ${evidence}`);
        } else if (action==='fail') { requireStatus(order,'PICKED_UP'); change(order,'FAILED','delivery.fail',actor,required(input.reason,'failure reason')); }
        else fail('Unknown Rider action');
        return store.order(order.id);
      });
    },
    resolveFailure(actor,id,input) {
      requireRole(actor,'Dispatcher');
      return store.transaction(() => {
        const order=get(id); requireStatus(order,'FAILED');
        const resolution=required(input.resolution,'resolution');
        if (resolution==='CANCELLED') { change(order,'CANCELLED','incident.resolve',actor,required(input.reason,'resolution reason')); store.run("UPDATE payments SET status='refund_pending' WHERE order_id=?",order.id); }
        else if (resolution==='DELIVERED') {
          const point=store.one('SELECT * FROM storage_points WHERE id=? AND active=1',Number(input.storage_point_id));
          if (!point) fail('Select an active storage point');
          const evidence=required(input.evidence,'delivery evidence');
          store.run('UPDATE orders SET storage_point_id=? WHERE id=?',point.id,order.id);
          change(order,'DELIVERED','incident.resolve',actor,`Storage point ${point.name}; Evidence: ${evidence}`);
        } else fail('Invalid resolution');
        return store.order(order.id);
      });
    },
    track(no,lastFour) {
      if (!/^\d{4}$/.test(String(lastFour||''))) fail('Enter the last four digits of the phone number');
      const order=store.orderByTracking(String(no||'').trim().toUpperCase());
      if (!order || !order.recipient_phone.endsWith(String(lastFour))) fail('No matching parcel found',404);
      const point=order.storage_point_id ? store.one('SELECT name,address FROM storage_points WHERE id=?',order.storage_point_id):null;
      return { tracking_no:order.tracking_no,status:order.status,point,events:store.events(order.id).map(e=>({status:e.status,created_at:e.created_at,event_type:e.event_type})) };
    }
  };
}
