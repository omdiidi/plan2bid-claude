import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { ExportData } from "./types";
import type { EstimateLineItem } from "@/types";
import { formatTypeLabel } from "@/lib/utils";

// ── Template colors ──
const DARK_TEAL = "2F4F4F";
const LIGHT_BLUE = "D9E1F2";
const SUBTOTAL_GREEN = "E2EFDA";
const RECAP_BLUE = "BDD7EE";
const NAVY = "1F4E79";
const WHITE = "FFFFFF";
const BLACK = "000000";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "D1D5DB" } },
  bottom: { style: "thin", color: { argb: "D1D5DB" } },
  left: { style: "thin", color: { argb: "D1D5DB" } },
  right: { style: "thin", color: { argb: "D1D5DB" } },
};

const COLS = 9; // A-I

// ── CSI Division mapping ──
const CSI_DIVISIONS: Record<string, { number: string; label: string }> = {
  demolition:       { number: "02", label: "SELECTIVE DEMOLITION" },
  concrete:         { number: "03", label: "CONCRETE" },
  structural_steel: { number: "05", label: "METALS & STRUCTURAL STEEL" },
  framing:          { number: "06", label: "WOOD, PLASTICS & COMPOSITES" },
  roofing:          { number: "07", label: "THERMAL & MOISTURE PROTECTION" },
  drywall:          { number: "09A", label: "DRYWALL & FRAMING" },
  painting:         { number: "09B", label: "PAINTING & COATINGS" },
  flooring:         { number: "09C", label: "FLOORING" },
  fire_protection:  { number: "21", label: "FIRE SUPPRESSION" },
  plumbing:         { number: "22", label: "PLUMBING" },
  hvac:             { number: "23", label: "HVAC" },
  electrical:       { number: "26", label: "ELECTRICAL" },
  low_voltage:      { number: "27", label: "LOW VOLTAGE & COMMUNICATIONS" },
  landscaping:      { number: "31", label: "EARTHWORK & LANDSCAPING" },
};

function getDivision(trade: string): { number: string; label: string } {
  return CSI_DIVISIONS[trade] ?? { number: "99", label: formatTypeLabel(trade).toUpperCase() };
}

function applyFill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleRow(row: ExcelJS.Row, cols: number, opts: {
  bg?: string; fontColor?: string; bold?: boolean; size?: number;
}) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = {
      bold: opts.bold ?? false,
      color: opts.fontColor ? { argb: opts.fontColor } : { argb: BLACK },
      name: "Calibri",
      size: opts.size ?? 10,
    };
    if (opts.bg) applyFill(cell, opts.bg);
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle" };
  }
}

function getItemMarkup(item: EstimateLineItem, data: ExportData, type: "material" | "labor"): number {
  if (type === "material") {
    return data.materialMarkup?.[item.item_id]?.markupPercent ?? data.effectiveMarkup;
  }
  return data.laborMarkup?.[item.item_id]?.markupPercent ?? data.effectiveMarkup;
}

function getItemWaste(item: EstimateLineItem, data: ExportData): number {
  return data.wasteItems?.[item.item_id] ?? 0;
}

export async function exportIndustryXlsx(data: ExportData): Promise<void> {
  const { project, lineItems, isGcMode, tradeSections, anomalyReport } = data;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cost Estimate");
  const dateStr = new Date(project.generatedAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  ws.columns = [
    { width: 14 },  // A: Item
    { width: 60 },  // B: Description
    { width: 10 },  // C: Qty
    { width: 8 },   // D: Unit
    { width: 14 },  // E: Mat'l Unit$
    { width: 14 },  // F: Mat'l Total
    { width: 14 },  // G: Labor Unit$
    { width: 14 },  // H: Labor Total
    { width: 16 },  // I: Line Total
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT HEADER
  // ═══════════════════════════════════════════════════════════════════════════
  const titleRow = ws.addRow(["PLAN2BID CONSTRUCTION COST ESTIMATE"]);
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, COLS);
  titleRow.getCell(1).font = { bold: true, size: 14, name: "Calibri", color: { argb: BLACK } };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 28;

  const addrRow = ws.addRow([project.address]);
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, COLS);
  addrRow.getCell(1).font = { bold: true, size: 12, name: "Calibri" };
  addrRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

  ws.addRow([]); // blank separator

  // Metadata rows
  const metaFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10 };
  const labelFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10, bold: true };

  const addMetaRow = (label: string, value: string) => {
    const row = ws.addRow([label, "", value]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 2);
    ws.mergeCells(ws.rowCount, 3, ws.rowCount, 4);
    row.getCell(1).font = labelFont;
    row.getCell(3).font = metaFont;
  };

  addMetaRow("Project Name:", project.name);
  addMetaRow("Facility Type:", formatTypeLabel(project.facilityType));
  addMetaRow("Project Type:", formatTypeLabel(project.projectType));
  const tradesList = isGcMode && tradeSections
    ? Object.keys(tradeSections).map(t => formatTypeLabel(t)).join(", ")
    : formatTypeLabel(project.trade);
  addMetaRow("Trade(s):", tradesList);

  ws.addRow([]); // blank

  if (data.projectDescription) {
    addMetaRow("Project Description:", data.projectDescription);
    ws.addRow([]);
  }

  if (data.tradeSummaryText) {
    addMetaRow("Summary:", data.tradeSummaryText);
    ws.addRow([]);
  }

  if (data.overallSummaryText) {
    addMetaRow("Overview:", data.overallSummaryText);
    ws.addRow([]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLUMN HEADERS
  // ═══════════════════════════════════════════════════════════════════════════
  const hdrRow = ws.addRow(["Item", "Description", "Qty", "Unit", "Mat'l Unit$", "Mat'l Total", "Labor Unit$", "Labor Total", "Line Total"]);
  for (let c = 1; c <= COLS; c++) {
    const cell = hdrRow.getCell(c);
    applyFill(cell, DARK_TEAL);
    cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = THIN_BORDER;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIVISIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const groups: Record<string, EstimateLineItem[]> = {};
  if (isGcMode && tradeSections) {
    for (const [trade, items] of Object.entries(tradeSections)) groups[trade] = items;
  } else {
    groups[project.trade || "estimate"] = lineItems;
  }

  // Sort trades by CSI division number
  const sortedTrades = Object.keys(groups).sort((a, b) => {
    const da = getDivision(a).number;
    const db = getDivision(b).number;
    return da.localeCompare(db);
  });

  const divisionTotals: { trade: string; total: number }[] = [];

  for (const trade of sortedTrades) {
    const items = [...groups[trade]].sort((a, b) => a.item_id.localeCompare(b.item_id));
    const div = getDivision(trade);

    // Division header
    const divRow = ws.addRow([`DIVISION ${div.number} — ${formatTypeLabel(trade).toUpperCase()}`]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, COLS);
    applyFill(divRow.getCell(1), LIGHT_BLUE);
    divRow.getCell(1).font = { bold: true, size: 10, name: "Calibri", color: { argb: BLACK } };

    let divTotal = 0;

    for (const item of items) {
      const wastePct = getItemWaste(item, data);
      const matMarkup = getItemMarkup(item, data, "material");
      const labMarkup = getItemMarkup(item, data, "labor");

      const matUnitCost = item.has_material ? (item.material_unit_cost ?? 0) : 0;
      const matTotal = item.has_material
        ? (item.material_extended_cost ?? 0) * (1 + wastePct / 100) * (1 + matMarkup / 100)
        : 0;

      const labRate = item.has_labor ? (item.labor_hourly_rate ?? 0) : 0;
      const labTotal = item.has_labor
        ? (item.labor_cost ?? 0) * (1 + labMarkup / 100)
        : 0;

      const lineTotal = matTotal + labTotal;
      divTotal += lineTotal;

      // Build description: material name first, then task action
      let desc = item.description;
      if (item.has_material && item.material_description && item.material_description !== item.description) {
        desc = `${item.material_description} — ${item.description}`;
      } else if (item.has_material && item.material_description) {
        desc = item.material_description;
      }

      const row = ws.addRow([
        item.item_id,
        desc,
        item.quantity,
        item.unit,
        matUnitCost,
        matTotal,
        labRate,
        labTotal,
        lineTotal,
      ]);

      // Style data row
      for (let c = 1; c <= COLS; c++) {
        const cell = row.getCell(c);
        cell.font = { name: "Calibri", size: 10, color: { argb: BLACK } };
        cell.alignment = {
          vertical: "middle",
          wrapText: c === 2,
          horizontal: c >= 3 ? (c <= 4 ? "center" : "right") : undefined,
        };
        cell.border = THIN_BORDER;
      }
      row.height = 30;
      row.getCell(5).numFmt = '"$"#,##0.00';
      row.getCell(6).numFmt = '"$"#,##0';
      row.getCell(7).numFmt = '"$"#,##0.00';
      row.getCell(8).numFmt = '"$"#,##0';
      row.getCell(9).numFmt = '"$"#,##0';
    }

    // Subtotal row
    const subRow = ws.addRow([`SUBTOTAL — ${formatTypeLabel(trade).toUpperCase()}`, "", "", "", "", "", "", "", divTotal]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 8);
    styleRow(subRow, COLS, { bg: SUBTOTAL_GREEN, bold: true });
    subRow.getCell(9).numFmt = '"$"#,##0';

    divisionTotals.push({ trade, total: divTotal });

    ws.addRow([]); // blank after division
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER — RECAP + TOTALS
  // ═══════════════════════════════════════════════════════════════════════════
  const directCost = divisionTotals.reduce((s, d) => s + d.total, 0);

  // Division recap
  for (const dt of divisionTotals) {
    const row = ws.addRow(["", formatTypeLabel(dt.trade).toUpperCase(), "", "", "", "", "", "", dt.total]);
    row.getCell(2).font = { name: "Calibri", size: 10 };
    row.getCell(9).font = { name: "Calibri", size: 10 };
    row.getCell(9).numFmt = '"$"#,##0';
    row.getCell(9).alignment = { horizontal: "right" };
  }

  // Direct construction cost
  const directRow = ws.addRow(["DIRECT CONSTRUCTION COST (SUBTOTAL)", "", "", "", "", "", "", "", directCost]);
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, 8);
  styleRow(directRow, COLS, { bg: RECAP_BLUE, bold: true });
  directRow.getCell(9).numFmt = '"$"#,##0';

  // Contingency
  if (data.effectiveContingency > 0) {
    const amt = directCost * (data.effectiveContingency / 100);
    const row = ws.addRow([`CONTINGENCY (${data.effectiveContingency}%)`, "", "", "", "", "", "", "", amt]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 8);
    row.getCell(1).font = { name: "Calibri", size: 10 };
    row.getCell(9).font = { name: "Calibri", size: 10 };
    row.getCell(9).numFmt = '"$"#,##0';
    row.getCell(9).alignment = { horizontal: "right" };
  }

  // Overhead
  if (data.effectiveOverhead > 0) {
    const amt = directCost * (data.effectiveOverhead / 100);
    const row = ws.addRow([`GC OVERHEAD (${data.effectiveOverhead}%)`, "", "", "", "", "", "", "", amt]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 8);
    row.getCell(1).font = { name: "Calibri", size: 10 };
    row.getCell(9).font = { name: "Calibri", size: 10 };
    row.getCell(9).numFmt = '"$"#,##0';
    row.getCell(9).alignment = { horizontal: "right" };
  }

  // Total Bid Price (markup already included in per-item client costs)
  const totalBid = directCost
    + directCost * (data.effectiveContingency / 100)
    + directCost * (data.effectiveOverhead / 100);

  ws.addRow([]); // blank before total
  const bidRow = ws.addRow(["\u2605 TOTAL BID PRICE", "", "", "", "", "", "", "", totalBid]);
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, 8);
  styleRow(bidRow, COLS, { bg: NAVY, fontColor: WHITE, bold: true, size: 12 });
  bidRow.getCell(9).numFmt = '"$"#,##0';

  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALIES
  // ═══════════════════════════════════════════════════════════════════════════
  const allAnomalies = [
    ...(anomalyReport?.priced_in ?? []).map(a => ({ ...a, type: "Priced In" })),
    ...(anomalyReport?.noted ?? []).map(a => ({ ...a, type: "Noted" })),
  ];

  if (allAnomalies.length > 0) {
    ws.addRow([]);
    const anomalyHeader = ws.addRow(["Anomalies"]);
    anomalyHeader.getCell(1).font = { bold: true, name: "Calibri", size: 10 };

    allAnomalies.forEach((a, i) => {
      const row = ws.addRow([`${i + 1}. ${a.description}`]);
      ws.mergeCells(ws.rowCount, 1, ws.rowCount, COLS);
      row.getCell(1).font = { name: "Calibri", size: 9 };
      row.getCell(1).alignment = { wrapText: true };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════════
  const buffer = await wb.xlsx.writeBuffer();
  const dateSlug = new Date(project.generatedAt).toISOString().slice(0, 10);
  const filename = `Plan2Bid - ${project.name} - Industry Standard - ${dateSlug}.xlsx`;
  saveAs(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename,
  );
}
