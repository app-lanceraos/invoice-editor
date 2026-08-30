// Every content element the editor knows about. Elements are FIXED WIDGETS —
// users never type invoice data, they only toggle, restyle, position, resize
// and rotate them. `render` returns the static display string/structure baked
// into the element itself.
//
// `defaultBox` is both the item's placement AND its natural size the first
// time it's added — the natural size a resize's content-scaling transform
// measures against (see CanvasItem.jsx). Positions are hand-placed to
// roughly reconstruct the old zone-based layout as a sensible starting
// point; nothing after creation depends on these values, they're just seed
// data for `initialTemplateState` and for whatever appears when re-toggling
// an element back on.

export const ELEMENT_TYPES = {
  logo: {
    label: 'Logo',
    required: false,
    defaultOn: true,
    variant: 'image',
    shapeOptions: ['square', 'rounded', 'circle'],
    defaultBox: { x: 32, y: 32, width: 42, height: 42 },
    render: () => ({ kind: 'image', placeholder: 'logo' }),
  },
  businessName: {
    label: 'Business name',
    required: true,
    defaultOn: true,
    variant: 'text',
    defaultBox: { x: 90, y: 36, width: 130, height: 18 },
    render: () => 'Business Name',
  },
  invoiceNumber: {
    label: 'Invoice number',
    required: true,
    defaultOn: true,
    variant: 'text',
    defaultBox: { x: 236, y: 36, width: 90, height: 18 },
    render: () => 'INV-0001',
  },
  issueDate: {
    label: 'Issue date',
    required: true,
    defaultOn: true,
    variant: 'text',
    defaultBox: { x: 342, y: 36, width: 150, height: 18 },
    render: () => 'Issue date: 01-01-2026',
  },
  dueDate: {
    label: 'Due date',
    required: false,
    defaultOn: true,
    variant: 'text',
    defaultBox: { x: 508, y: 36, width: 150, height: 18 },
    render: () => 'Due Date: 15-01-2026',
  },
  billTo: {
    label: 'Bill to',
    required: true,
    defaultOn: true,
    variant: 'block',
    defaultBox: { x: 32, y: 100, width: 170, height: 95 },
    render: () => ['Bill To', 'Client Name', 'Client Company', '123 Client Street', 'client@email.com'],
  },
  from: {
    label: 'From',
    required: true,
    defaultOn: true,
    variant: 'block',
    defaultBox: { x: 222, y: 100, width: 170, height: 95 },
    render: () => ['From', 'Business Name', '456 Business Ave', 'owner@business.com'],
  },
  itemsTable: {
    label: 'Items table',
    required: true,
    defaultOn: true,
    variant: 'table',
    defaultBox: { x: 32, y: 220, width: 730, height: 150 },
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
    required: true,
    defaultOn: true,
    variant: 'row',
    defaultBox: { x: 542, y: 390, width: 220, height: 22 },
    render: () => ['Subtotal', '$2,930.00'],
  },
  tax: {
    label: 'Tax',
    required: false,
    defaultOn: false,
    variant: 'row',
    defaultBox: { x: 542, y: 416, width: 220, height: 22 },
    render: () => ['Tax (5%)', '$146.50'],
  },
  discount: {
    label: 'Discount',
    required: false,
    defaultOn: false,
    variant: 'row',
    defaultBox: { x: 542, y: 442, width: 220, height: 22 },
    render: () => ['Discount', '−$100.00'],
  },
  totalDue: {
    label: 'Total due',
    required: true,
    defaultOn: true,
    variant: 'row-strong',
    defaultBox: { x: 542, y: 468, width: 220, height: 26 },
    render: () => ['Total due', '$2,976.50'],
  },
  currencyConversion: {
    label: 'Currency conversion',
    required: false,
    defaultOn: false,
    variant: 'note',
    defaultBox: { x: 542, y: 498, width: 220, height: 18 },
    render: () => '≈ PKR 826,000 at rate 278.0',
  },
  notes: {
    label: 'Notes',
    required: false,
    defaultOn: true,
    variant: 'block',
    defaultBox: { x: 32, y: 920, width: 340, height: 50 },
    render: () => ['Notes', 'Thank you for your business. Please reach out with any questions.'],
  },
  terms: {
    label: 'Terms',
    required: false,
    defaultOn: false,
    variant: 'block',
    defaultBox: { x: 32, y: 980, width: 340, height: 45 },
    render: () => ['Terms', 'Payment due within 14 days of the issue date.'],
  },
  paymentMethods: {
    label: 'Payment methods',
    required: false,
    defaultOn: true,
    variant: 'block',
    defaultBox: { x: 400, y: 920, width: 340, height: 60 },
    render: () => ['Payment methods', 'Bank transfer — Example Bank ••1234', 'Payoneer — pay@business.com'],
  },
  payOnline: {
    label: 'Pay online',
    required: false,
    defaultOn: false,
    variant: 'qr',
    defaultBox: { x: 32, y: 1010, width: 140, height: 70 },
    render: () => ({ label: 'Pay online', link: 'pay.example.com/inv-0001' }),
  },
  signature: {
    label: 'Signature',
    required: false,
    defaultOn: false,
    variant: 'image',
    defaultBox: { x: 652, y: 1020, width: 110, height: 50 },
    render: () => ({ kind: 'image', placeholder: 'signature' }),
  },
  wordmark: {
    label: 'Wordmark',
    required: false,
    defaultOn: false,
    variant: 'image',
    defaultBox: { x: 347, y: 1085, width: 100, height: 24 },
    render: () => ({ kind: 'image', placeholder: 'wordmark' }),
  },
};

export const createContentItem = (type) => {
  const def = ELEMENT_TYPES[type];
  const { x, y, width, height } = def.defaultBox;
  return {
    id: `content-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: 'content',
    type,
    x,
    y,
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    rotation: 0,
  };
};
