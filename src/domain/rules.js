export class BusinessError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status) => { throw new BusinessError(message, status); };
export function requireRole(actor, role) {
  if (!actor || !actor.active || !(actor.roles ? actor.roles.includes(role) : actor.role === role))
    fail('You do not have permission to perform this action', 403);
}
export function requireStatus(order, ...statuses) {
  if (!statuses.includes(order.status)) fail(`Order status ${order.status} does not allow this action`);
}
export function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`Please enter ${label}`);
  return text;
}
export function validPhone(phone) {
  const value = required(phone, 'Phone number').replace(/[ -]/g, '');
  if (!/^\+?\d{8,15}$/.test(value)) fail('Phone number must contain 8–15 digits');
  return value;
}
