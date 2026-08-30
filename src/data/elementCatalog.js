// Every content element the editor knows about. Elements are FIXED WIDGETS —
// users never type invoice data, they only toggle, restyle, reorder and
// rotate them. `render` returns the static display string/structure baked
// into the element itself.

export const REGIONS = {
  header: { label: 'Header', slotCount: 4 },
  party: { label: 'Parties', slotCount: 2 },
  table: { label: 'Items table', slotCount: 1, locked: true },
  totals: { label: 'Totals', slotCount: 5 },
  lower: { label: 'Notes & payment', slotCount: 3 },
  signRow: { label: 'Sign row', slotCount: 2 },
  footer: { label: 'Footer', slotCount: 1, locked: true },
};

export const ELEMENT_TYPES = {
  logo: {
    label: 'Logo',
    region: 'header',
    required: false,
    defaultOn: true,
    variant: 'image',
    shapeOptions: ['square', 'rounded', 'circle'],
    render: () => ({ kind: 'image', placeholder: 'logo' }),
  },
  businessName: {
    label: 'Business name',
    region: 'header',
    required: true,
    defaultOn: true,
    variant: 'text',
    render: () => 'Business Name',
  },
  invoiceNumber: {
    label: 'Invoice number',
    region: 'header',
    required: true,
    defaultOn: true,
    variant: 'text',
    render: () => 'INV-0001',
  },
  issueDate: {
    label: 'Issue date',
    region: 'header',
    required: true,
    defaultOn: true,
    variant: 'text',
    render: () => 'Issue date: 01-01-2026',
  },
  dueDate: {
    label: 'Due date',
    region: 'header',
    required: false,
    defaultOn: true,
    variant: 'text',
    render: () => 'Due Date: 15-01-2026',
  },
  billTo: {
    label: 'Bill to',
    region: 'party',
    required: true,
    defaultOn: true,
    variant: 'block',
    render: () => ['Bill To', 'Client Name', 'Client Company', '123 Client Street', 'client@email.com'],
  },
  from: {
    label: 'From',
    region: 'party',
    required: true,
    defaultOn: true,
    variant: 'block',
    render: () => ['From', 'Business Name', '456 Business Ave', 'owner@business.com'],
  },
  itemsTable: {
    label: 'Items table',
    region: 'table',
    required: true,
    defaultOn: true,
    variant: 'table',
    render: () => ({
      columns: ['Description', 'Qty', 'Rate', 'Amount'],
      rows: [
        ['Website design', '1', '$1,200.00', '$1,200.00'],
        ['Logo & brand kit', '1', '$450.00', '$450.00'],
        ['Development (hrs)', '20', '$60.00', '$1,200.00'],
        ['Hosting setup', '1', '$80.00', '$80.00'],
      ],
    }),
  },
  subtotal: {
    label: 'Subtotal',
    region: 'totals',
    required: true,
    defaultOn: true,
    variant: 'row',
    render: () => ['Subtotal', '$2,930.00'],
  },
  tax: {
    label: 'Tax',
    region: 'totals',
    required: false,
    defaultOn: false,
    variant: 'row',
    render: () => ['Tax (5%)', '$146.50'],
  },
  discount: {
    label: 'Discount',
    region: 'totals',
    required: false,
    defaultOn: false,
    variant: 'row',
    render: () => ['Discount', '−$100.00'],
  },
  totalDue: {
    label: 'Total due',
    region: 'totals',
    required: true,
    defaultOn: true,
    variant: 'row-strong',
    render: () => ['Total due', '$2,976.50'],
  },
  currencyConversion: {
    label: 'Currency conversion',
    region: 'totals',
    required: false,
    defaultOn: false,
    variant: 'note',
    render: () => '≈ PKR 826,000 at rate 278.0',
  },
  notes: {
    label: 'Notes',
    region: 'lower',
    required: false,
    defaultOn: true,
    variant: 'block',
    render: () => ['Notes', 'Thank you for your business. Please reach out with any questions.'],
  },
  terms: {
    label: 'Terms',
    region: 'lower',
    required: false,
    defaultOn: false,
    variant: 'block',
    render: () => ['Terms', 'Payment due within 14 days of the issue date.'],
  },
  paymentMethods: {
    label: 'Payment methods',
    region: 'lower',
    required: false,
    defaultOn: true,
    variant: 'block',
    render: () => ['Payment methods', 'Bank transfer — Example Bank ••1234', 'Payoneer — pay@business.com'],
  },
  payOnline: {
    label: 'Pay online',
    region: 'signRow',
    required: false,
    defaultOn: false,
    variant: 'qr',
    render: () => ({ label: 'Pay online', link: 'pay.example.com/inv-0001' }),
  },
  signature: {
    label: 'Signature',
    region: 'signRow',
    required: false,
    defaultOn: false,
    variant: 'image',
    render: () => ({ kind: 'image', placeholder: 'signature' }),
  },
  wordmark: {
    label: 'Wordmark',
    region: 'footer',
    required: false,
    defaultOn: false,
    variant: 'image',
    locked: true,
    render: () => ({ kind: 'image', placeholder: 'wordmark' }),
  },
};

export const elementsForRegion = (region) =>
  Object.entries(ELEMENT_TYPES)
    .filter(([, def]) => def.region === region)
    .map(([type, def]) => ({ type, ...def }));

export const isRequired = (type) => !!ELEMENT_TYPES[type]?.required;
