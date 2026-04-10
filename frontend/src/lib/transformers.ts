// ── Transformers: backend EstimateLineItem → frontend table shapes ──
// Shared across Results.tsx, GCTradeTab.tsx, and SubcontractorBid.tsx

import type { EstimateLineItem } from "@/types";
import type { MaterialItem, LaborItem } from "@/lib/constants";

export function lineItemToMaterial(item: EstimateLineItem): MaterialItem {
  const unitCost = item.material_unit_cost ?? 0;
  return {
    id: item.item_id,
    description: item.description,
    materialName: item.material_description || item.description,
    taskDescription: item.description,
    modelNumber: item.material_model_number ?? null,
    manufacturer: item.material_manufacturer ?? null,
    reasoning: item.material_reasoning ?? null,
    qty: item.quantity,
    unit: item.unit,
    unitCost,
    total: item.material_extended_cost ?? unitCost * item.quantity,
    confidence: item.material_confidence ?? item.overall_confidence,
    confidenceNotes: item.confidence_notes ?? "",
    costLow: unitCost * 0.85,
    costExpected: unitCost,
    costHigh: unitCost * 1.15,
    source: {
      document: item.source_refs?.[0]?.doc_filename ?? "Unknown",
      page: item.source_refs?.[0]?.page_number ?? 0,
    },
    detail: {
      pricingMethod: item.material_pricing_method ?? "Unknown",
      sources: (item.material_sources ?? []).map(s => ({
        name: s.source_name,
        url: s.url ?? "",
      })),
      notes: item.material_pricing_notes ?? "",
    },
  };
}

export function lineItemToLabor(item: EstimateLineItem): LaborItem {
  const hours = item.labor_hours ?? 0;
  const rate = item.labor_hourly_rate ?? 0;
  return {
    id: item.item_id,
    description: item.description,
    crew: item.labor_crew_summary ?? "—",
    hours,
    hourlyRate: rate,
    total: item.labor_cost ?? hours * rate,
    confidence: item.labor_confidence ?? item.overall_confidence,
    confidenceNotes: item.confidence_notes ?? "",
    hoursLow: hours * 0.85,
    hoursExpected: hours,
    hoursHigh: hours * 1.2,
    rateLow: rate * 0.9,
    rateExpected: rate,
    rateHigh: rate * 1.15,
    source: {
      document: item.source_refs?.[0]?.doc_filename ?? "Unknown",
      page: item.source_refs?.[0]?.page_number ?? 0,
    },
    detail: {
      hoursBreakdown: `${hours} total hours`,
      productivityRate: "",
      reasoning: item.labor_reasoning ?? "",
      siteAdjustments: (item.labor_site_adjustments ?? []).map(
        a => typeof a === "string" ? a : `${a.factor}: ${a.description} (×${a.multiplier})`
      ),
    },
  };
}
