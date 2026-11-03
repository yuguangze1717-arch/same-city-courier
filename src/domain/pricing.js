import { BusinessError } from './rules.js';

// Project pricing assumption. Weight rounding follows the HK domestic practice
// described by SF Express; these prices are not SF Express tariffs.
export function quoteForWeight(rawWeightKg) {
  const raw = String(rawWeightKg ?? '').trim();
  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(raw))
    throw new BusinessError('Enter a weight in kg with up to two decimal places.');
  const weightGrams = Math.round(Number(raw) * 1000);
  if (weightGrams < 10 || weightGrams > 20_000)
    throw new BusinessError('Weight must be between 0.01 and 20 kg.');
  const chargeableGrams = weightGrams <= 5000
    ? Math.ceil(weightGrams / 500) * 500
    : Math.ceil(weightGrams / 1000) * 1000;
  const halfKgSteps = Math.max(0, (Math.min(chargeableGrams, 5000) - 1000) / 500);
  const extraKgSteps = Math.max(0, (chargeableGrams - 5000) / 1000);
  const amountCents = 3500 + halfKgSteps * 700 + extraKgSteps * 1200;
  return { weightGrams, chargeableGrams, amountCents };
}
