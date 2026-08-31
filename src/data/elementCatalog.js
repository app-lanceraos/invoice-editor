import { create as createQRCode } from 'qrcode/lib/core/qrcode.js';

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

// 'From' and the fixed footer both show the same business identity — one
// source, referenced by both, so they can never drift into separate copies
// of what's meant to be the same fixed demo data.
const FROM_BUSINESS_NAME = 'Business Name';
const FROM_EMAIL = 'owner@business.com';

// The QR pattern is generated once, at module load, from the same static
// demo link already shown as text — `qrcode`'s synchronous `create()` (the
// core encoder, no canvas/PNG renderer pulled in) hands back the raw module
// matrix, which we turn into a single SVG path of unit squares ourselves.
// A real vector path — not a rasterized image — so it scales cleanly
// through the same CSS transform every other item's content does.
const PAY_LINK = 'pay.example.com/inv-0001';
const qr = createQRCode(PAY_LINK, { errorCorrectionLevel: 'M' });
const QR_SIZE = qr.modules.size;
const QR_PATH = (() => {
  const data = qr.modules.data;
  let d = '';
  for (let row = 0; row < QR_SIZE; row++) {
    for (let col = 0; col < QR_SIZE; col++) {
      if (data[row * QR_SIZE + col]) d += `M${col},${row}h1v1h-1z`;
    }
  }
  return d;
})();

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
  // The small eyebrow label the original Django template placed above the
  // business name (`<div class="eyebrow">Invoice</div>`) — never made it
  // into this catalog until now.
  invoice: {
    label: 'Invoice',
    required: false,
    defaultOn: true,
    variant: 'text',
    defaultBox: { x: 90, y: 24, width: 60, height: 10 },
    render: () => 'Invoice',
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
  // 'label-value' is a styling split only — the label ("Issue date:") and
  // the value ("01-01-2026") are each their own independently-selectable
  // part (see item.label / item.value in CanvasItem.jsx, same pattern as
  // block title/lines), but the displayed text itself is exactly what it
  // always was, still fixed baked-in content.
  issueDate: {
    label: 'Issue date',
    required: true,
    defaultOn: true,
    variant: 'label-value',
    defaultBox: { x: 342, y: 36, width: 150, height: 18 },
    render: () => ({ label: 'Issue date:', value: '01-01-2026' }),
  },
  dueDate: {
    label: 'Due date',
    required: true,
    defaultOn: true,
    variant: 'label-value',
    defaultBox: { x: 508, y: 36, width: 150, height: 18 },
    render: () => ({ label: 'Due Date:', value: '15-01-2026' }),
  },
  // block-variant `render()` returns { title, lines }: `title` is the
  // heading (never individually deletable), `lines` is the body, each with
  // its own `key` (used for per-line selection/style, see item[line.key]
  // in CanvasItem.jsx) and `required` (blocks that one line from being
  // deleted the same way a required top-level item is protected — an
  // item's currently-hidden optional lines live in item.hiddenLines).
  billTo: {
    label: 'Bill to',
    required: true,
    defaultOn: true,
    variant: 'block',
    defaultBox: { x: 32, y: 100, width: 170, height: 95 },
    render: () => ({
      title: { key: 'title', label: 'Title', text: 'Bill To' },
      lines: [
        { key: 'clientName', label: 'Client name', text: 'Client Name', required: true },
        { key: 'clientCompany', label: 'Company', text: 'Client Company', required: false },
        { key: 'address', label: 'Address', text: '123 Client Street', required: false },
        { key: 'email', label: 'Email', text: 'client@email.com', required: false },
      ],
    }),
  },
  from: {
    label: 'From',
    required: true,
    defaultOn: true,
    variant: 'block',
    defaultBox: { x: 222, y: 100, width: 170, height: 95 },
    render: () => ({
      title: { key: 'title', label: 'Title', text: 'From' },
      lines: [
        { key: 'businessName', label: 'Business name', text: FROM_BUSINESS_NAME, required: true },
        { key: 'address', label: 'Address', text: '456 Business Ave', required: false },
        { key: 'email', label: 'Email', text: FROM_EMAIL, required: true },
      ],
    }),
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
    // A single-line block: that one line is `required` (not individually
    // removable) since deleting it would just leave an empty card behind —
    // removing the whole thing is what the top-level toggle is for.
    render: () => ({
      title: { key: 'title', label: 'Title', text: 'Notes' },
      lines: [
        { key: 'body', label: 'Note', text: 'Thank you for your business. Please reach out with any questions.', required: true },
      ],
    }),
  },
  terms: {
    label: 'Terms',
    required: false,
    defaultOn: false,
    variant: 'block',
    defaultBox: { x: 32, y: 980, width: 340, height: 45 },
    render: () => ({
      title: { key: 'title', label: 'Title', text: 'Terms' },
      lines: [
        { key: 'body', label: 'Terms', text: 'Payment due within 14 days of the issue date.', required: true },
      ],
    }),
  },
  paymentMethods: {
    label: 'Payment methods',
    required: false,
    defaultOn: true,
    variant: 'block',
    defaultBox: { x: 400, y: 920, width: 340, height: 60 },
    render: () => ({
      title: { key: 'title', label: 'Title', text: 'Payment methods' },
      lines: [
        { key: 'bankTransfer', label: 'Bank transfer', text: 'Bank transfer — Example Bank ••1234', required: false },
        { key: 'payoneer', label: 'Payoneer', text: 'Payoneer — pay@business.com', required: false },
      ],
    }),
  },
  payOnline: {
    label: 'Pay online',
    required: false,
    defaultOn: false,
    variant: 'qr',
    defaultBox: { x: 650, y: 930, width: 110, height: 130 },
    render: () => ({ label: 'Pay online', link: PAY_LINK, qrPath: QR_PATH, qrSize: QR_SIZE }),
  },
  // The original template composed a signature out of three stacked
  // pieces (image, rule, caption) rather than one unit — kept as three
  // fully independent top-level items here too, not a single item with
  // nested parts (contrast with the block title/lines pattern): each has
  // its own position/size/style/delete, no shared bounding box. Default
  // positions just stack them in the same visual order as a courtesy for
  // "turn all three on at once"; nothing ties them together afterward.
  signatureImage: {
    label: 'Signature image',
    required: false,
    defaultOn: false,
    variant: 'image',
    defaultBox: { x: 32, y: 1028, width: 110, height: 35 },
    render: () => ({ kind: 'image', placeholder: 'signature' }),
  },
  signatureDivider: {
    label: 'Signature divider',
    required: false,
    defaultOn: false,
    variant: 'divider',
    defaultBox: { x: 32, y: 1065, width: 110, height: 3 },
    render: () => null,
  },
  signatureLabel: {
    label: 'Signature label',
    required: false,
    defaultOn: false,
    variant: 'text',
    defaultBox: { x: 32, y: 1070, width: 110, height: 12 },
    render: () => 'Authorised Signature',
  },
  // Fixed page chrome, not an optional element: `hidden` keeps it out of the
  // elements library panel entirely, `locked` (propagated onto the created
  // item below) is the one mechanism CanvasItem/deleteItems/duplicateItems
  // already respect for "can't be selected, moved, resized, or duplicated".
  // Sources its business identity from the same FROM_* constants `from`
  // itself renders from, so the two can never drift apart.
  footer: {
    label: 'Footer',
    required: false,
    defaultOn: true,
    hidden: true,
    locked: true,
    variant: 'footer',
    defaultBox: { x: 0, y: 1085, width: 794, height: 38 },
    render: () => ({ businessName: FROM_BUSINESS_NAME, email: FROM_EMAIL }),
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
    locked: !!def.locked,
  };
};
