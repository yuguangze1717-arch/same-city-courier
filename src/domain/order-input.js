import { BusinessError } from './rules.js';
import { isDistrict } from './districts.js';
import { quoteForWeight } from './pricing.js';

export const ITEM_CATEGORIES = Object.freeze(['Documents', 'Clothing', 'Electronics', 'Household goods', 'Other']);

export const ORDER_FIELD_LABELS = Object.freeze({
  pickup_district: 'Pickup district',
  pickup_address: 'Pickup address details',
  dropoff_district: 'Destination district',
  dropoff_address: 'Destination address details',
  item_category: 'Item category',
  item_description: 'Item description',
  weight_kg: 'Estimated weight',
  recipient_name: 'Recipient name',
  recipient_phone: 'Recipient phone'
});

export class OrderValidationError extends BusinessError {
  constructor(errors, values) {
    super('Please correct the highlighted fields.', 422);
    this.errors = errors;
    this.values = values;
  }
}

export function validateOrderInput(input = {}) {
  const values = Object.fromEntries(Object.keys(ORDER_FIELD_LABELS).map(key => [key, String(input[key] ?? '').trim()]));
  const errors = {};
  for (const key of ['pickup_district', 'dropoff_district']) {
    if (!values[key]) errors[key] = `Select a ${key === 'pickup_district' ? 'pickup' : 'destination'} district.`;
    else if (!isDistrict(values[key])) errors[key] = `Select a valid ${key === 'pickup_district' ? 'pickup' : 'destination'} district.`;
  }
  for (const key of ['pickup_address', 'dropoff_address', 'recipient_name']) {
    if (!values[key]) errors[key] = `Enter ${ORDER_FIELD_LABELS[key].toLowerCase()}.`;
  }
  if (!values.item_category) errors.item_category = 'Select an item category.';
  else if (!ITEM_CATEGORIES.includes(values.item_category)) errors.item_category = 'Select a valid item category.';
  if (!values.item_description) errors.item_description = 'Enter a brief item description.';
  else if (values.item_description.length > 120) errors.item_description = 'Keep the item description within 120 characters.';
  if (!values.weight_kg) errors.weight_kg = 'Enter the estimated weight.';
  else {
    try { quoteForWeight(values.weight_kg); }
    catch (error) { errors.weight_kg = error.message; }
  }
  if (!values.recipient_phone) errors.recipient_phone = 'Enter recipient phone.';
  else {
    const phone = values.recipient_phone.replace(/[ -]/g, '');
    if (!/^\+?\d{8,15}$/.test(phone)) errors.recipient_phone = 'Enter a phone number with 8–15 digits.';
    else values.recipient_phone = phone;
  }
  if (Object.keys(errors).length) throw new OrderValidationError(errors, values);
  return values;
}
