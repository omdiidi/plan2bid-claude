import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ExportData } from "./types";
import type { EstimateLineItem, AnomalyFlag } from "@/types";

// ── Color tokens ──────────────────────────────────────────────────────────────

const C = {
  navy: "#0f172a",
  navyMid: "#1e293b",
  blue: "#2563eb",
  blueLight: "#dbeafe",
  green: "#15803d",
  greenBg: "#dcfce7",
  amber: "#b45309",
  amberBg: "#fef3c7",
  red: "#b91c1c",
  redBg: "#fee2e2",
  gray50: "#f8fafc",
  gray100: "#f1f5f9",
  gray200: "#e2e8f0",
  gray400: "#94a3b8",
  gray500: "#64748b",
  gray700: "#374151",
  white: "#ffffff",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatLabel(value: string): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function trunc(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function confidenceColor(level: string): string {
  if (level === "high") return C.green;
  if (level === "medium") return C.amber;
  return C.red;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.navy,
    paddingTop: 72,
    paddingBottom: 52,
    paddingHorizontal: 40,
    backgroundColor: C.white,
  },

  // Fixed header (every page)
  pageHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1.5,
    borderBottomColor: C.navy,
    backgroundColor: C.white,
  },
  wordmark: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 7,
    color: C.gray500,
    marginTop: 2,
  },
  pageHeaderRight: {
    alignItems: "flex-end",
  },
  reportLabel: {
    fontSize: 7,
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  pageNumber: {
    fontSize: 7,
    color: C.gray400,
    marginTop: 2,
  },

  // Fixed footer (every page)
  pageFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: C.gray200,
    backgroundColor: C.white,
  },
  footerLeft: { fontSize: 7, color: C.gray500 },
  footerRight: { fontSize: 7, color: C.gray400, textAlign: "right" },

  // Watermark
  watermark: {
    position: "absolute",
    fontSize: 68,
    color: "#0f172a06",
    fontFamily: "Helvetica-Bold",
    top: "30%",
    left: "8%",
    transform: "rotate(-40deg)",
    letterSpacing: 6,
  },

  // Cover block
  coverBlock: {
    backgroundColor: C.navy,
    borderRadius: 6,
    padding: 24,
    marginBottom: 20,
  },
  coverAddress: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 8,
    lineHeight: 1.3,
  },
  coverMeta: {
    fontSize: 11,
    color: C.blueLight,
    marginBottom: 4,
  },
  coverDate: {
    fontSize: 8,
    color: C.gray400,
    textAlign: "right",
    marginTop: 8,
  },

  // Section title
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.blue,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    paddingLeft: 8,
    marginBottom: 10,
    marginTop: 18,
  },

  // Cost cards
  cardRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 6,
    padding: 12,
    backgroundColor: C.gray50,
  },
  cardHighlight: {
    flex: 1,
    borderWidth: 2,
    borderColor: C.blue,
    borderRadius: 6,
    padding: 12,
    backgroundColor: C.blueLight,
  },
  cardLabel: {
    fontSize: 7,
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardAmount: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 4,
  },
  cardHighlightAmount: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.blue,
    marginBottom: 4,
  },
  cardRange: {
    fontSize: 7,
    color: C.gray500,
  },

  // Final bid callout
  finalBidBox: {
    backgroundColor: C.navy,
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  finalBidLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  finalBidBreakdown: {
    fontSize: 7,
    color: C.gray400,
    marginTop: 3,
  },
  finalBidAmount: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },

  // Confidence bar
  confBarWrapper: {
    marginBottom: 16,
  },
  confBarTrack: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 6,
  },
  confLegend: {
    flexDirection: "row",
    gap: 16,
  },
  confLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  confDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confLegendText: {
    fontSize: 7,
    color: C.gray500,
  },

  // Table
  table: {
    marginBottom: 4,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: C.navy,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginBottom: 1,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: C.gray50,
  },
  tableCell: {
    fontSize: 7.5,
    color: C.gray700,
  },
  tableCellBold: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
  },
  tableFooterRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: C.gray200,
    marginTop: 1,
  },

  // Confidence badge
  badge: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // Anomaly cards
  anomalyCard: {
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  anomalyBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  anomalyDesc: {
    fontSize: 8,
    color: C.gray700,
    lineHeight: 1.4,
    marginBottom: 2,
  },
  anomalyImpact: {
    fontSize: 7,
    color: C.gray500,
  },
});

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  const bg = level === "high" ? C.greenBg : level === "medium" ? C.amberBg : C.redBg;
  const fg = confidenceColor(level);
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{level}</Text>
    </View>
  );
}

function MaterialsTable({
  items,
  isGcMode,
}: {
  items: EstimateLineItem[];
  isGcMode: boolean;
}) {
  // Column flex widths
  const cols = isGcMode
    ? { num: 0.04, trade: 0.09, desc: 0.40, qty: 0.08, unit: 0.08, unit_cost: 0.13, extended: 0.18 }
    : { num: 0.04, desc: 0.42, qty: 0.08, unit: 0.08, unit_cost: 0.14, extended: 0.16, notes: 0.08 };

  const total = items.reduce((sum, i) => sum + (i.material_extended_cost ?? 0), 0);

  return (
    <View style={s.table}>
      {/* Header */}
      <View style={s.tableHeaderRow}>
        <Text style={[s.tableHeaderCell, { flex: cols.num }]}>#</Text>
        {isGcMode && <Text style={[s.tableHeaderCell, { flex: (cols as Record<string,number>).trade }]}>Trade</Text>}
        <Text style={[s.tableHeaderCell, { flex: cols.desc }]}>Description</Text>
        <Text style={[s.tableHeaderCell, { flex: cols.qty }]}>Qty</Text>
        <Text style={[s.tableHeaderCell, { flex: cols.unit }]}>Unit</Text>
        <Text style={[s.tableHeaderCell, { flex: cols.unit_cost, textAlign: "right" }]}>Unit Cost</Text>
        <Text style={[s.tableHeaderCell, { flex: cols.extended, textAlign: "right" }]}>Extended</Text>
        {!isGcMode && <Text style={[s.tableHeaderCell, { flex: (cols as Record<string,number>).notes }]}>Method</Text>}
      </View>

      {/* Rows */}
      {items.map((item, i) => {
        const RowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
        const tradeCode = isGcMode ? formatLabel(item.item_id.split("-")[0] ?? "") : "";
        return (
          <View key={item.item_id} style={RowStyle} wrap={false}>
            <Text style={[s.tableCell, { flex: cols.num }]}>{i + 1}</Text>
            {isGcMode && (
              <Text style={[s.tableCell, { flex: (cols as Record<string,number>).trade }]}>{trunc(tradeCode, 10)}</Text>
            )}
            <Text style={[s.tableCell, { flex: cols.desc }]}>
              {trunc(item.description, isGcMode ? 48 : 58)}
            </Text>
            <Text style={[s.tableCell, { flex: cols.qty }]}>{item.quantity}</Text>
            <Text style={[s.tableCell, { flex: cols.unit }]}>{item.unit}</Text>
            <Text style={[s.tableCell, { flex: cols.unit_cost, textAlign: "right" }]}>
              {fmt(item.material_unit_cost ?? 0)}
            </Text>
            <Text style={[s.tableCell, { flex: cols.extended, textAlign: "right" }]}>
              {fmt(item.material_extended_cost ?? 0)}
            </Text>
            {!isGcMode && (
              <Text style={[s.tableCell, { flex: (cols as Record<string,number>).notes }]}>
                {trunc((item.material_pricing_method ?? "").replace(/_/g, " "), 18)}
              </Text>
            )}
          </View>
        );
      })}

      {/* Footer */}
      <View style={s.tableFooterRow}>
        <Text style={[s.tableCellBold, { flex: 1 }]}>TOTAL</Text>
        <Text style={[s.tableCellBold, { textAlign: "right" }]}>{fmt(total)}</Text>
      </View>
    </View>
  );
}

function LaborTable({
  items,
  isGcMode,
}: {
  items: EstimateLineItem[];
  isGcMode: boolean;
}) {
  const cols = isGcMode
    ? { num: 0.04, trade: 0.09, desc: 0.37, crew: 0.20, hours: 0.08, rate: 0.10, total: 0.12 }
    : { num: 0.04, desc: 0.40, crew: 0.22, hours: 0.10, rate: 0.11, total: 0.13 };

  const total = items.reduce((sum, i) => sum + (i.labor_cost ?? 0), 0);

  return (
    <View style={s.table}>
      {/* Header */}
      <View style={s.tableHeaderRow}>
        <Text style={[s.tableHeaderCell, { flex: cols.num }]}>#</Text>
        {isGcMode && <Text style={[s.tableHeaderCell, { flex: (cols as Record<string,number>).trade }]}>Trade</Text>}
        <Text style={[s.tableHeaderCell, { flex: cols.desc }]}>Description</Text>
        <Text style={[s.tableHeaderCell, { flex: cols.crew }]}>Crew</Text>
        <Text style={[s.tableHeaderCell, { flex: cols.hours, textAlign: "right" }]}>Hours</Text>
        <Text style={[s.tableHeaderCell, { flex: cols.rate, textAlign: "right" }]}>Rate/hr</Text>
        <Text style={[s.tableHeaderCell, { flex: cols.total, textAlign: "right" }]}>Total</Text>
      </View>

      {/* Rows */}
      {items.map((item, i) => {
        const RowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
        const tradeCode = isGcMode ? formatLabel(item.item_id.split("-")[0] ?? "") : "";
        return (
          <View key={item.item_id} style={RowStyle} wrap={false}>
            <Text style={[s.tableCell, { flex: cols.num }]}>{i + 1}</Text>
            {isGcMode && (
              <Text style={[s.tableCell, { flex: (cols as Record<string,number>).trade }]}>{trunc(tradeCode, 10)}</Text>
            )}
            <Text style={[s.tableCell, { flex: cols.desc }]}>
              {trunc(item.description, isGcMode ? 48 : 58)}
            </Text>
            <Text style={[s.tableCell, { flex: cols.crew }]}>
              {trunc(item.labor_crew_summary ?? "—", 30)}
            </Text>
            <Text style={[s.tableCell, { flex: cols.hours, textAlign: "right" }]}>
              {(item.labor_hours ?? 0).toFixed(1)}
            </Text>
            <Text style={[s.tableCell, { flex: cols.rate, textAlign: "right" }]}>
              {fmt(item.labor_hourly_rate ?? 0)}
            </Text>
            <Text style={[s.tableCell, { flex: cols.total, textAlign: "right" }]}>
              {fmt(item.labor_cost ?? 0)}
            </Text>
          </View>
        );
      })}

      {/* Footer */}
      <View style={s.tableFooterRow}>
        <Text style={[s.tableCellBold, { flex: 1 }]}>TOTAL</Text>
        <Text style={[s.tableCellBold, { textAlign: "right" }]}>{fmt(total)}</Text>
      </View>
    </View>
  );
}

function AnomalyItem({ anomaly, type }: { anomaly: AnomalyFlag; type: "priced_in" | "noted" }) {
  const isPricedIn = type === "priced_in";
  const bg = isPricedIn ? C.greenBg : C.amberBg;
  const fg = isPricedIn ? C.green : C.amber;
  const label = isPricedIn ? "Priced In" : "Noted";

  return (
    <View style={[s.anomalyCard, { backgroundColor: bg }]}>
      <Text style={[s.anomalyBadge, { color: fg }]}>
        {label} — {anomaly.category}
      </Text>
      <Text style={s.anomalyDesc}>{anomaly.description}</Text>
      {anomaly.cost_impact != null && (
        <Text style={s.anomalyImpact}>
          Estimated impact: {fmt(anomaly.cost_impact)}
        </Text>
      )}
    </View>
  );
}

// ── Main Document ─────────────────────────────────────────────────────────────

export function EstimatePdf({ data }: { data: ExportData }) {
  const {
    project,
    lineItems,
    costSummary,
    confidenceDistribution: cd,
    anomalyReport,
    effectiveMarkup,
    effectiveOverhead,
    effectiveContingency,
    materialSubtotal,
    laborSubtotal,
    grandTotal,
    isGcMode,
    tradeSubtotals,
  } = data;

  const { effectiveTax } = data;
  const directSubtotal = materialSubtotal + laborSubtotal;
  const markupAmt = directSubtotal * (effectiveMarkup / 100);
  const taxAmt = materialSubtotal * (effectiveTax / 100);
  const overheadAmt = directSubtotal * (effectiveOverhead / 100);
  const contingencyAmt = directSubtotal * (effectiveContingency / 100);
  const finalBid = directSubtotal + markupAmt + taxAmt + overheadAmt + contingencyAmt;
  const hasAdders = effectiveMarkup > 0 || effectiveOverhead > 0 || effectiveContingency > 0 || effectiveTax > 0;

  const materialItems = lineItems.filter((li) => li.has_material);
  const laborItems = lineItems.filter((li) => li.has_labor);
  const allAnomalies = [...anomalyReport.priced_in, ...anomalyReport.noted];

  const totalItems = cd.high_count + cd.medium_count + cd.low_count || 1;
  const highPct = (cd.high_count / totalItems) * 100;
  const medPct = (cd.medium_count / totalItems) * 100;
  const lowPct = (cd.low_count / totalItems) * 100;

  // Low/high estimates for cards
  const matLow = costSummary.materials_subtotal * 0.85;
  const matHigh = costSummary.materials_subtotal * 1.15;
  const laborLow = costSummary.labor_subtotal * 0.85;
  const laborHigh = costSummary.labor_subtotal * 1.15;
  const grandLow = matLow + laborLow;
  const grandHigh = matHigh + laborHigh;

  return (
    <Document
      title={`Plan2Bid Estimate — ${project.address}`}
      author="plan2bid"
      subject="Construction Estimate"
    >
      <Page size="A4" style={s.page} wrap>
        {/* Watermark — behind everything */}
        <Text style={s.watermark} fixed>
          plan2bid
        </Text>

        {/* Fixed page header */}
        <View style={s.pageHeader} fixed>
          <View>
            <Text style={s.wordmark}>plan2bid</Text>
            <Text style={s.tagline}>AI-Powered Construction Estimating</Text>
          </View>
          <View style={s.pageHeaderRight}>
            <Text style={s.reportLabel}>Estimate Report</Text>
            <Text
              style={s.pageNumber}
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
          </View>
        </View>

        {/* ── Cover block ── */}
        <View style={s.coverBlock}>
          <Text style={s.coverAddress}>{project.address}</Text>
          <Text style={s.coverMeta}>
            {formatLabel(project.trade)} · {formatLabel(project.facilityType)} ·{" "}
            {formatLabel(project.projectType)}
          </Text>
          <Text style={s.coverDate}>Generated {fmtDate(project.generatedAt)}</Text>
        </View>

        {/* ── Cost summary cards ── */}
        <View style={s.cardRow}>
          <View style={s.card}>
            <Text style={s.cardLabel}>Materials</Text>
            <Text style={s.cardAmount}>{fmt(materialSubtotal)}</Text>
            <Text style={s.cardRange}>
              Low {fmt(matLow)} · High {fmt(matHigh)}
            </Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>Labor</Text>
            <Text style={s.cardAmount}>{fmt(laborSubtotal)}</Text>
            <Text style={s.cardRange}>
              Low {fmt(laborLow)} · High {fmt(laborHigh)}
            </Text>
          </View>
          <View style={hasAdders ? s.card : s.cardHighlight}>
            <Text style={s.cardLabel}>Grand Total</Text>
            <Text style={hasAdders ? s.cardAmount : s.cardHighlightAmount}>
              {fmt(grandTotal)}
            </Text>
            <Text style={s.cardRange}>
              Low {fmt(grandLow)} · High {fmt(grandHigh)}
            </Text>
          </View>
        </View>

        {/* ── Final bid box (if adders) ── */}
        {hasAdders && (
          <View style={s.finalBidBox}>
            <View>
              <Text style={s.finalBidLabel}>Final Bid</Text>
              <Text style={s.finalBidBreakdown}>
                {[
                  `Direct: ${fmt(directSubtotal)}`,
                  effectiveMarkup > 0 ? `Markup ${effectiveMarkup}%: ${fmt(markupAmt)}` : null,
                  effectiveTax > 0 ? `Materials Tax ${effectiveTax}%: ${fmt(taxAmt)}` : null,
                  effectiveOverhead > 0 ? `Overhead ${effectiveOverhead}%: ${fmt(overheadAmt)}` : null,
                  effectiveContingency > 0 ? `Contingency ${effectiveContingency}%: ${fmt(contingencyAmt)}` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
            </View>
            <Text style={s.finalBidAmount}>{fmt(finalBid)}</Text>
          </View>
        )}

        {/* ── GC trade breakdown ── */}
        {isGcMode && tradeSubtotals && (
          <>
            <Text style={s.sectionTitle}>Trade Breakdown</Text>
            <View style={s.table}>
              <View style={s.tableHeaderRow}>
                <Text style={[s.tableHeaderCell, { flex: 0.4 }]}>Trade</Text>
                <Text style={[s.tableHeaderCell, { flex: 0.2, textAlign: "right" }]}>Materials</Text>
                <Text style={[s.tableHeaderCell, { flex: 0.2, textAlign: "right" }]}>Labor</Text>
                <Text style={[s.tableHeaderCell, { flex: 0.2, textAlign: "right" }]}>Total</Text>
              </View>
              {Object.entries(tradeSubtotals).map(([trade, sub], i) => (
                <View key={trade} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt} wrap={false}>
                  <Text style={[s.tableCell, { flex: 0.4 }]}>{formatLabel(trade)}</Text>
                  <Text style={[s.tableCell, { flex: 0.2, textAlign: "right" }]}>
                    {fmt(sub.materials_subtotal)}
                  </Text>
                  <Text style={[s.tableCell, { flex: 0.2, textAlign: "right" }]}>
                    {fmt(sub.labor_subtotal)}
                  </Text>
                  <Text style={[s.tableCellBold, { flex: 0.2, textAlign: "right" }]}>
                    {fmt(sub.total)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Materials table ── */}
        {materialItems.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Materials — {materialItems.length} Items</Text>
            <MaterialsTable items={materialItems} isGcMode={isGcMode} />
          </>
        )}

        {/* ── Labor table ── */}
        {laborItems.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Labor — {laborItems.length} Items</Text>
            <LaborTable items={laborItems} isGcMode={isGcMode} />
          </>
        )}

        {/* ── Anomalies ── */}
        {allAnomalies.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Risk Flags & Anomalies</Text>
            {anomalyReport.priced_in.map((a, i) => (
              <AnomalyItem key={`pi-${i}`} anomaly={a} type="priced_in" />
            ))}
            {anomalyReport.noted.map((a, i) => (
              <AnomalyItem key={`n-${i}`} anomaly={a} type="noted" />
            ))}
          </>
        )}

        {/* Fixed page footer */}
        <View style={s.pageFooter} fixed>
          <Text style={s.footerLeft}>Confidential Estimate — plan2bid</Text>
          <Text style={s.footerRight}>
            Generated {fmtDate(project.generatedAt)} · All figures are estimates only
          </Text>
        </View>
      </Page>
    </Document>
  );
}
