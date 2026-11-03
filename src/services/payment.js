import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { fail } from '../domain/rules.js';

export function createMockGateway(secret) {
  const sign = (orderId, amount, ref) => createHmac('sha256', secret).update(`${orderId}:${amount}:${ref}`).digest('hex');
  return {
    pay(orderId, amount) { const ref = randomUUID(); return { orderId, amount, ref, signature: sign(orderId,amount,ref) }; },
    verify(payload) {
      const expected = Buffer.from(sign(payload.orderId,payload.amount,payload.ref), 'hex');
      const received = Buffer.from(String(payload.signature || ''), 'hex');
      if (expected.length !== received.length || !timingSafeEqual(expected,received)) fail('Invalid payment confirmation signature');
    }
  };
}
