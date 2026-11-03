const form = document.getElementById('create-order-form');
if (form) {
  const fields = [...form.querySelectorAll('[data-label]')];
  const summary = document.getElementById('order-validation-summary');
  const list = summary.querySelector('ul');
  const touched = new Set(fields.filter(field => field.classList.contains('is-invalid')));
  const weightField = form.querySelector('[name="weight_kg"]');
  const quotePrice = document.getElementById('quote-price');
  const quoteWeight = document.getElementById('quote-weight');
  let submitted = !summary.hidden;
  let quoteRequest = 0;

  function weightError(value) {
    if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(value)) return 'Enter a weight in kg with up to two decimal places.';
    if (Number(value) < 0.01 || Number(value) > 20) return 'Weight must be between 0.01 and 20 kg.';
    return '';
  }

  async function updateQuote() {
    const request = ++quoteRequest;
    const value = weightField.value.trim();
    if (!value || weightError(value)) {
      quotePrice.textContent = 'Enter weight to see price';
      quoteWeight.textContent = 'Based on estimated actual weight';
      return;
    }
    try {
      const response = await fetch(`/sender/quote?weight_kg=${encodeURIComponent(value)}`);
      if (!response.ok) throw new Error('Quote unavailable');
      const quote = await response.json();
      if (request !== quoteRequest) return;
      quotePrice.textContent = `HK$${(quote.amountCents / 100).toFixed(2)}`;
      quoteWeight.textContent = `Billable weight: ${(quote.chargeableGrams / 1000).toFixed(2)} kg`;
    } catch {
      if (request === quoteRequest) {
        quotePrice.textContent = 'Quote unavailable';
        quoteWeight.textContent = 'Try again or create the order to see the confirmed amount.';
      }
    }
  }

  function errorFor(field) {
    const value = field.value.trim();
    if (!value) return field.tagName === 'SELECT'
      ? field.name === 'item_category' ? 'Select an item category.' : `Select a ${field.dataset.label.toLowerCase()}.`
      : `Enter ${field.dataset.label.toLowerCase()}.`;
    if (field.name === 'weight_kg') return weightError(value);
    if (field.name === 'item_description' && value.length > 120) return 'Keep the item description within 120 characters.';
    if (field.name === 'recipient_phone' && !/^\+?\d{8,15}$/.test(value.replace(/[ -]/g, '')))
      return 'Enter a phone number with 8–15 digits.';
    return '';
  }

  function showFieldError(field, message) {
    field.classList.toggle('is-invalid', Boolean(message));
    field.setAttribute('aria-invalid', String(Boolean(message)));
    document.getElementById(`${field.name}-error`).textContent = message;
  }

  function updateSummary() {
    if (!submitted) { summary.hidden = true; return; }
    list.replaceChildren();
    for (const field of fields.filter(item => item.classList.contains('is-invalid'))) {
      const item = document.createElement('li');
      item.textContent = field.dataset.label;
      list.append(item);
    }
    summary.hidden = !list.children.length;
  }

  form.addEventListener('submit', event => {
    submitted = true;
    let firstInvalid;
    for (const field of fields) {
      const message = errorFor(field);
      showFieldError(field, message);
      if (message && !firstInvalid) firstInvalid = field;
    }
    updateSummary();
    if (firstInvalid) {
      event.preventDefault();
      firstInvalid.focus({ preventScroll: true });
      summary.scrollIntoView({ block: 'start' });
    }
  });

  for (const field of fields) {
    const recheck = () => {
      if (!submitted && !touched.has(field)) return;
      showFieldError(field, errorFor(field));
      updateSummary();
    };
    field.addEventListener('blur', () => {
      touched.add(field);
      showFieldError(field, errorFor(field));
      updateSummary();
    });
    field.addEventListener('input', recheck);
    field.addEventListener('change', recheck);
  }
  weightField.addEventListener('input', updateQuote);
  updateQuote();
}
