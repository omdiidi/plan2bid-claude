import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { ExportData } from "./types";
import type { EstimateLineItem } from "@/types";
import { formatTypeLabel } from "@/lib/utils";

// ── Template colors (from estim8r_template.xlsx) ──
const DARK_TEAL = "2F4F4F";
const LIGHT_BLUE = "D9E1F2";
const SUBTOTAL_GREEN = "E2EFDA";
const WHITE = "FFFFFF";
const BLACK = "000000";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "D1D5DB" } },
  bottom: { style: "thin", color: { argb: "D1D5DB" } },
  left: { style: "thin", color: { argb: "D1D5DB" } },
  right: { style: "thin", color: { argb: "D1D5DB" } },
};

function slugify(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40);
}

/** Sanitize sheet name: max 31 chars, no invalid chars */
function sheetName(trade: string): string {
  const label = formatTypeLabel(trade);
  return label.replace(/[[\]:*?/\\]/g, "").slice(0, 31);
}

function getItemWaste(item: EstimateLineItem, data: ExportData): number {
  return data.wasteItems?.[item.item_id] ?? 0;
}

function applyFill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleHeaderRow(row: ExcelJS.Row, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    applyFill(cell, DARK_TEAL);
    cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = THIN_BORDER;
  }
}

function styleDataRow(row: ExcelJS.Row, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { name: "Calibri", size: 10, color: { argb: BLACK } };
    cell.alignment = { vertical: "middle", wrapText: c === 2 || c === 3 };
    cell.border = THIN_BORDER;
  }
  row.height = 30;
}

function styleSubtotalRow(row: ExcelJS.Row, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    applyFill(cell, SUBTOTAL_GREEN);
    cell.font = { bold: true, name: "Calibri", size: 10, color: { argb: BLACK } };
    cell.alignment = { vertical: "middle" };
    cell.border = THIN_BORDER;
  }
}

// ── Column layout constants ──
const TRADE_COLS = 6; // A-F (materials and labor both 6 cols)

export async function exportXlsx(data: ExportData): Promise<void> {
  const { project, lineItems, isGcMode, tradeSections } = data;
  const wb = new ExcelJS.Workbook();
  const dateStr = new Date(project.generatedAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  // ── Build trade groups ──
  const groups: Record<string, EstimateLineItem[]> = {};
  if (isGcMode && tradeSections) {
    for (const [trade, items] of Object.entries(tradeSections)) groups[trade] = items;
  } else {
    groups[project.trade || "estimate"] = lineItems;
  }

  // ── Pre-compute per-trade totals for Summary tab ──
  const tradeTotals: { trade: string; matTotal: number; labTotal: number }[] = [];

  for (const [trade, items] of Object.entries(groups)) {
    let matTotal = 0;
    let labTotal = 0;

    for (const item of items) {
      if (item.has_material) {
        const wastePct = getItemWaste(item, data);
        matTotal += (item.material_extended_cost ?? 0) * (1 + wastePct / 100);
      }
      if (item.has_labor) {
        labTotal += item.labor_cost ?? 0;
      }
    }

    tradeTotals.push({ trade, matTotal, labTotal });
  }

  const grandMatTotal = tradeTotals.reduce((s, t) => s + t.matTotal, 0);
  const grandLabTotal = tradeTotals.reduce((s, t) => s + t.labTotal, 0);
  const grandTotal = grandMatTotal + grandLabTotal;

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY TAB
  // ═══════════════════════════════════════════════════════════════════════════
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { width: 8 },   // A spacer
    { width: 40 },  // B Trade
    { width: 18 },  // C Materials Total
    { width: 18 },  // D Labor Total
    { width: 18 },  // E Trade Total
  ];

  // Row 1: Title
  const titleRow = summary.addRow(["CONSTRUCTION COST ESTIMATE"]);
  summary.mergeCells(summary.rowCount, 1, summary.rowCount, 5);
  titleRow.getCell(1).font = { bold: true, size: 14, name: "Calibri", color: { argb: BLACK } };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 28;

  // Row 2: Project name + location
  const nameRow = summary.addRow([`${project.name} — ${project.address}`]);
  summary.mergeCells(summary.rowCount, 1, summary.rowCount, 5);
  nameRow.getCell(1).font = { bold: true, size: 12, name: "Calibri" };
  nameRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

  // Row 3: Facility type + date
  const metaRow = summary.addRow([`${formatTypeLabel(project.facilityType)} | ${dateStr}`]);
  summary.mergeCells(summary.rowCount, 1, summary.rowCount, 5);
  metaRow.getCell(1).font = { size: 10, name: "Calibri", color: { argb: "6B7280" } };
  metaRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

  // Row 4: blank
  summary.addRow([]);

  // Row 5: Headers
  const hdrRow = summary.addRow(["", "Trade", "Materials Total", "Labor Total", "Trade Total"]);
  styleHeaderRow(hdrRow, 5);

  // Row 6+: One row per trade
  for (const t of tradeTotals) {
    const row = summary.addRow(["", formatTypeLabel(t.trade), t.matTotal, t.labTotal, t.matTotal + t.labTotal]);
    styleDataRow(row, 5);
    row.getCell(3).numFmt = "$#,##0";
    row.getCell(4).numFmt = "$#,##0";
    row.getCell(5).numFmt = "$#,##0";
  }

  // Direct cost row
  const directRow = summary.addRow(["", "DIRECT COST", grandMatTotal, grandLabTotal, grandTotal]);
  styleSubtotalRow(directRow, 5);
  directRow.getCell(3).numFmt = "$#,##0";
  directRow.getCell(4).numFmt = "$#,##0";
  directRow.getCell(5).numFmt = "$#,##0";

  // Contingency, Overhead, Markup — use the UI's direct cost as base
  const uiDirectCost = data.grandTotal;
  const addFooterLine = (label: string, pct: number) => {
    if (pct <= 0) return;
    const amt = uiDirectCost * (pct / 100);
    const row = summary.addRow(["", `${label} (${pct}%)`, "", "", amt]);
    styleDataRow(row, 5);
    row.getCell(5).numFmt = "$#,##0";
  };

  addFooterLine("Contingency", data.effectiveContingency);
  addFooterLine("Overhead", data.effectiveOverhead);
  addFooterLine("Markup", data.effectiveMarkup);

  // Total Bid Price
  const totalBid = uiDirectCost
    + uiDirectCost * (data.effectiveContingency / 100)
    + uiDirectCost * (data.effectiveOverhead / 100)
    + uiDirectCost * (data.effectiveMarkup / 100);

  summary.addRow([]);
  const bidRow = summary.addRow(["", "\u2605 TOTAL BID PRICE", "", "", totalBid]);
  for (let c = 1; c <= 5; c++) {
    const cell = bidRow.getCell(c);
    applyFill(cell, "1F4E79");
    cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 12 };
    cell.alignment = { vertical: "middle" };
    cell.border = THIN_BORDER;
  }
  bidRow.getCell(5).numFmt = "$#,##0";

  // ═══════════════════════════════════════════════════════════════════════════
  // PER-TRADE TABS
  // ═══════════════════════════════════════════════════════════════════════════
  for (const [trade, items] of Object.entries(groups)) {
    const ws = wb.addWorksheet(sheetName(trade));
    ws.columns = [
      { width: 8 },   // A: ID
      { width: 40 },  // B: Description
      { width: 10 },  // C: Qty / Crew
      { width: 10 },  // D: Unit / Hours
      { width: 14 },  // E: Unit Cost / Rate
      { width: 18 },  // F: Total
    ];

    // ── MATERIALS SECTION ──
    const matHeader = ws.addRow(["MATERIALS"]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, TRADE_COLS);
    applyFill(matHeader.getCell(1), LIGHT_BLUE);
    matHeader.getCell(1).font = { bold: true, size: 11, name: "Calibri", color: { argb: BLACK } };

    const matColRow = ws.addRow(["ID", "Material", "Qty", "Unit", "Unit Cost", "Total"]);
    styleHeaderRow(matColRow, TRADE_COLS);

    const sortedItems = [...items].sort((a, b) => a.item_id.localeCompare(b.item_id));
    const matItems = sortedItems.filter(i => i.has_material);
    let matSubtotal = 0;

    for (const item of matItems) {
      const wastePct = getItemWaste(item, data);
      const wasteQty = item.quantity * (1 + wastePct / 100);
      const total = (item.material_extended_cost ?? 0) * (1 + wastePct / 100);
      matSubtotal += total;

      const row = ws.addRow([
        item.item_id,
        item.material_description || item.description,
        Math.round(wasteQty * 100) / 100,
        item.unit,
        item.material_unit_cost ?? 0,
        total,
      ]);
      styleDataRow(row, TRADE_COLS);
      row.getCell(5).numFmt = "$#,##0.00";
      row.getCell(6).numFmt = "$#,##0";
    }

    // Materials subtotal
    const matSubRow = ws.addRow(["  SUBTOTAL — MATERIALS", "", "", "", "", matSubtotal]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 5);
    styleSubtotalRow(matSubRow, TRADE_COLS);
    matSubRow.getCell(6).numFmt = "$#,##0";

    // Blank row
    ws.addRow([]);

    // ── LABOR SECTION ──
    const labHeader = ws.addRow(["LABOR"]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, TRADE_COLS);
    applyFill(labHeader.getCell(1), LIGHT_BLUE);
    labHeader.getCell(1).font = { bold: true, size: 11, name: "Calibri", color: { argb: BLACK } };

    const labColRow = ws.addRow(["ID", "Task", "Crew", "Hours", "Rate/hr", "Total"]);
    styleHeaderRow(labColRow, 6);

    const labItems = sortedItems.filter(i => i.has_labor);
    let labSubtotal = 0;

    for (const item of labItems) {
      const total = item.labor_cost ?? 0;
      labSubtotal += total;

      const row = ws.addRow([
        item.item_id,
        item.description,
        item.labor_crew_summary ?? "—",
        item.labor_hours ?? 0,
        item.labor_hourly_rate ?? 0,
        total,
      ]);
      styleDataRow(row, 6);
      row.getCell(5).numFmt = "$#,##0.00";
      row.getCell(6).numFmt = "$#,##0";
    }

    // Labor subtotal
    const labSubRow = ws.addRow(["  SUBTOTAL — LABOR", "", "", "", "", labSubtotal]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 5);
    styleSubtotalRow(labSubRow, 6);
    labSubRow.getCell(6).numFmt = "$#,##0";

    // Blank row
    ws.addRow([]);

    // ── TRADE TOTAL ──
    const tradeTotal = matSubtotal + labSubtotal;
    const tradeTotalRow = ws.addRow(["  TRADE TOTAL", "", "", "", "", tradeTotal]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 5);
    for (let c = 1; c <= TRADE_COLS; c++) {
      const cell = tradeTotalRow.getCell(c);
      applyFill(cell, DARK_TEAL);
      cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
      cell.alignment = { vertical: "middle" };
      cell.border = THIN_BORDER;
    }
    tradeTotalRow.getCell(6).numFmt = "$#,##0";
  }

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer();
  const dateSlug = new Date(project.generatedAt).toISOString().slice(0, 10);
  const filename = `Plan2Bid - ${project.name} - ${dateSlug}.xlsx`;
  saveAs(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename,
  );
}
