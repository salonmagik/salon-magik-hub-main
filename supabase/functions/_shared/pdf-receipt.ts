import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "npm:pdf-lib@1.17.1";

// Shared A4 receipt renderer for both booking receipts (salon -> customer,
// brand: "salon") and subscription receipts (Salon Magik -> salon,
// brand: "product"). Mirrors the layout approved in the PDF Receipts design
// artifact — header with brand mark, billed-to/payment columns, itemized
// table, totals, status pill, footer.

export interface ReceiptLineItem {
  label: string;
  sublabel?: string;
  amount: number;
}

export interface ReceiptPdfOptions {
  brand: "salon" | "product";
  brandName: string;
  brandSubtitle?: string;
  reference: string;
  billedToName: string;
  billedToLines: string[];
  paymentLines: string[];
  lineItems: ReceiptLineItem[];
  deductions?: ReceiptLineItem[];
  total: number;
  currency: string;
  statusLabel: string;
  statusTone?: "success" | "pending";
  footerThanks: string;
  footerLines: string[];
}

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 62;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.067, 0.094, 0.153); // #111827
const MUTED = rgb(0.290, 0.333, 0.408); // #4b5563
const FAINT = rgb(0.612, 0.639, 0.686); // #9ca3af
const HAIRLINE = rgb(0.902, 0.902, 0.902); // #e6e6e6
const PURPLE = rgb(0.180, 0.122, 0.306); // #2E1F4E
const GOLD = rgb(0.957, 0.784, 0.306); // #F4C84E
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.035, 0.588, 0.412); // #059669
const GREEN_BG = rgb(0.925, 0.992, 0.961); // #ecfdf5
const GREEN_BORDER = rgb(0.655, 0.949, 0.831); // #a7f3d0
const GOLD_BG = rgb(0.984, 0.953, 0.871); // #fbf3de
const GOLD_TEXT = rgb(0.573, 0.396, 0.055); // #92650e
const GOLD_BORDER = rgb(0.941, 0.859, 0.659); // #f0dba8

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Lemniscate mark — identical path to SalonMagikLogo.tsx across all three
// frontend apps, stroke-only, gold on a purple roundel.
const LOGO_SVG_PATH =
  "M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z";

function drawLogoMark(page: PDFPage, x: number, y: number, size: number) {
  const roundelRadius = 6;
  page.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    color: PURPLE,
    borderWidth: 0,
  });
  // pdf-lib has no native rounded-rect fill helper pre-1.17 without
  // drawSquare's borderRadius — approximate with a plain square, close
  // enough at this size for a receipt header mark.
  void roundelRadius;

  const iconSize = size * 0.6;
  const offset = (size - iconSize) / 2;
  page.drawSvgPath(LOGO_SVG_PATH, {
    x: x + offset,
    y: y + size - offset,
    scale: iconSize / 32,
    borderColor: GOLD,
    borderWidth: 3.5 / (32 / iconSize),
    color: undefined,
  });
  const dotRadius = 2.3 * (iconSize / 32);
  page.drawCircle({
    x: x + size / 2,
    y: y + size / 2,
    size: dotRadius,
    color: WHITE,
  });
}

function drawInitialMark(page: PDFPage, x: number, y: number, size: number, initial: string, font: PDFFont) {
  page.drawRectangle({ x, y, width: size, height: size, color: PURPLE });
  const textSize = size * 0.42;
  const textWidth = font.widthOfTextAtSize(initial, textSize);
  page.drawText(initial, {
    x: x + (size - textWidth) / 2,
    y: y + size / 2 - textSize * 0.35,
    size: textSize,
    font,
    color: WHITE,
  });
}

export async function buildReceiptPdf(options: ReceiptPdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let cursorY = PAGE_HEIGHT - MARGIN;

  // ---- Header ----
  const markSize = 34;
  if (options.brand === "product") {
    drawLogoMark(page, MARGIN, cursorY - markSize, markSize);
  } else {
    drawInitialMark(page, MARGIN, cursorY - markSize, markSize, options.brandName.charAt(0).toUpperCase(), bold);
  }
  page.drawText(options.brandName, {
    x: MARGIN + markSize + 10,
    y: cursorY - 14,
    size: 13,
    font: bold,
    color: INK,
  });
  if (options.brandSubtitle) {
    page.drawText(options.brandSubtitle, {
      x: MARGIN + markSize + 10,
      y: cursorY - 28,
      size: 9,
      font,
      color: FAINT,
    });
  }

  const titleText = "Receipt";
  const titleSize = 17;
  const titleWidth = bold.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, {
    x: PAGE_WIDTH - MARGIN - titleWidth,
    y: cursorY - 12,
    size: titleSize,
    font: bold,
    color: INK,
  });
  const refText = options.reference;
  const refSize = 9.5;
  const refWidth = font.widthOfTextAtSize(refText, refSize);
  page.drawText(refText, {
    x: PAGE_WIDTH - MARGIN - refWidth,
    y: cursorY - 28,
    size: refSize,
    font,
    color: MUTED,
  });

  cursorY -= markSize + 26;
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
    thickness: 1,
    color: HAIRLINE,
  });
  cursorY -= 22;

  // ---- Parties (billed to / payment) ----
  const colWidth = CONTENT_WIDTH / 2 - 10;
  const partyTop = cursorY;

  page.drawText("BILLED TO", { x: MARGIN, y: partyTop, size: 8, font: bold, color: FAINT });
  let leftY = partyTop - 14;
  page.drawText(options.billedToName, { x: MARGIN, y: leftY, size: 11, font: bold, color: INK });
  leftY -= 15;
  for (const line of options.billedToLines) {
    page.drawText(line, { x: MARGIN, y: leftY, size: 9.5, font, color: MUTED });
    leftY -= 13;
  }

  const rightX = MARGIN + colWidth + 20;
  page.drawText("PAYMENT", { x: rightX, y: partyTop, size: 8, font: bold, color: FAINT });
  let rightY = partyTop - 14;
  for (const line of options.paymentLines) {
    const w = font.widthOfTextAtSize(line, 9.5);
    page.drawText(line, { x: PAGE_WIDTH - MARGIN - w, y: rightY, size: 9.5, font, color: MUTED });
    rightY -= 13;
  }

  cursorY = Math.min(leftY, rightY) - 12;
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
    thickness: 1,
    color: HAIRLINE,
  });
  cursorY -= 24;

  // ---- Line items table ----
  page.drawText("ITEM", { x: MARGIN, y: cursorY, size: 8, font: bold, color: FAINT });
  const priceHeaderText = "PRICE";
  const priceHeaderWidth = font.widthOfTextAtSize(priceHeaderText, 8);
  page.drawText(priceHeaderText, { x: PAGE_WIDTH - MARGIN - priceHeaderWidth, y: cursorY, size: 8, font: bold, color: FAINT });
  cursorY -= 6;
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
    thickness: 1.3,
    color: INK,
  });
  cursorY -= 18;

  for (const item of options.lineItems) {
    page.drawText(item.label, { x: MARGIN, y: cursorY, size: 10.5, font: bold, color: INK });
    const amountText = formatMoney(item.amount, options.currency);
    const amountWidth = font.widthOfTextAtSize(amountText, 10.5);
    page.drawText(amountText, { x: PAGE_WIDTH - MARGIN - amountWidth, y: cursorY, size: 10.5, font, color: INK });
    if (item.sublabel) {
      cursorY -= 13;
      page.drawText(item.sublabel, { x: MARGIN, y: cursorY, size: 8.5, font, color: FAINT });
    }
    cursorY -= 12;
    page.drawLine({
      start: { x: MARGIN, y: cursorY },
      end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
      thickness: 0.75,
      color: HAIRLINE,
    });
    cursorY -= 16;
  }

  // ---- Totals ----
  const totalsWidth = 220;
  const totalsX = PAGE_WIDTH - MARGIN - totalsWidth;
  const subtotal = options.lineItems.reduce((sum, item) => sum + item.amount, 0);

  const drawTotalRow = (label: string, value: string, opts: { bold?: boolean; color?: RGB; size?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const useFont = opts.bold ? bold : font;
    const color = opts.color ?? MUTED;
    page.drawText(label, { x: totalsX, y: cursorY, size, font: useFont, color });
    const valueWidth = useFont.widthOfTextAtSize(value, size);
    page.drawText(value, { x: PAGE_WIDTH - MARGIN - valueWidth, y: cursorY, size, font: useFont, color });
    cursorY -= 17;
  };

  drawTotalRow("Subtotal", formatMoney(subtotal, options.currency));
  for (const deduction of options.deductions ?? []) {
    drawTotalRow(deduction.label, `-${formatMoney(deduction.amount, options.currency)}`, { color: GREEN });
  }
  cursorY -= 2;
  page.drawLine({
    start: { x: totalsX, y: cursorY + 12 },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY + 12 },
    thickness: 1.3,
    color: INK,
  });
  drawTotalRow("Total", formatMoney(options.total, options.currency), { bold: true, color: INK, size: 12.5 });

  // ---- Status pill ----
  cursorY -= 10;
  const isPending = options.statusTone === "pending";
  const pillBg = isPending ? GOLD_BG : GREEN_BG;
  const pillBorder = isPending ? GOLD_BORDER : GREEN_BORDER;
  const pillText = isPending ? GOLD_TEXT : GREEN;
  const pillLabel = options.statusLabel;
  const pillTextWidth = bold.widthOfTextAtSize(pillLabel, 9);
  const pillWidth = pillTextWidth + 24;
  const pillHeight = 20;
  page.drawRectangle({
    x: MARGIN,
    y: cursorY - pillHeight,
    width: pillWidth,
    height: pillHeight,
    color: pillBg,
    borderColor: pillBorder,
    borderWidth: 1,
  });
  page.drawText(pillLabel, {
    x: MARGIN + 12,
    y: cursorY - pillHeight + 6,
    size: 9,
    font: bold,
    color: pillText,
  });

  // ---- Footer ----
  const footerY = 90;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 30 },
    end: { x: PAGE_WIDTH - MARGIN, y: footerY + 30 },
    thickness: 1,
    color: HAIRLINE,
  });
  const thanksWidth = font.widthOfTextAtSize(options.footerThanks, 10);
  page.drawText(options.footerThanks, {
    x: (PAGE_WIDTH - thanksWidth) / 2,
    y: footerY + 10,
    size: 10,
    font,
    color: MUTED,
  });
  let fy = footerY - 6;
  for (const line of options.footerLines) {
    const w = font.widthOfTextAtSize(line, 8);
    page.drawText(line, { x: (PAGE_WIDTH - w) / 2, y: fy, size: 8, font, color: FAINT });
    fy -= 12;
  }

  return doc.save();
}
