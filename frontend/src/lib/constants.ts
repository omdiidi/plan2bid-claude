// Enum constants and shared types for Estim8r UI

export const TRADES = [
  { value: "general_contractor", label: "General Contractor", subtitle: "Estimates all trades" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "hvac", label: "HVAC" },
  { value: "concrete", label: "Concrete" },
  { value: "demolition", label: "Demolition" },
  { value: "framing", label: "Framing" },
  { value: "drywall", label: "Drywall" },
  { value: "roofing", label: "Roofing" },
  { value: "painting", label: "Painting" },
  { value: "flooring", label: "Flooring" },
  { value: "landscaping", label: "Landscaping" },
  { value: "fire_protection", label: "Fire Protection" },
  { value: "structural_steel", label: "Structural Steel" },
  { value: "low_voltage", label: "Low Voltage" },
] as const;

export const FACILITY_TYPES = [
  { value: "data_center", label: "Data Center" },
  { value: "government", label: "Government" },
  { value: "hospital", label: "Hospital" },
  { value: "hotel", label: "Hotel" },
  { value: "industrial", label: "Industrial" },
  { value: "laboratory", label: "Laboratory" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "multi_family", label: "Multi-Family" },
  { value: "occupied_retail", label: "Occupied Retail" },
  { value: "office", label: "Office" },
  { value: "parking_structure", label: "Parking Structure" },
  { value: "religious_assembly", label: "Religious / Assembly" },
  { value: "residential", label: "Residential" },
  { value: "restaurant", label: "Restaurant" },
  { value: "school", label: "School" },
  { value: "warehouse", label: "Warehouse" },
  { value: "other", label: "Other" },
] as const;

export const PROJECT_TYPES = [
  { value: "addition", label: "Addition" },
  { value: "demolition", label: "Demolition" },
  { value: "lot_clearing", label: "Lot Clearing" },
  { value: "new_build", label: "New Build" },
  { value: "renovation_restoration", label: "Renovation / Restoration" },
  { value: "seismic_retrofit", label: "Seismic Retrofit" },
  { value: "shell_and_prep", label: "Shell & Prep" },
  { value: "site_work", label: "Site Work" },
  { value: "systems_replacement", label: "Systems Replacement" },
  { value: "tenant_improvement", label: "Tenant Improvement" },
  { value: "other", label: "Other" },
] as const;

export const UNITS = ["each", "LF", "SF", "CY", "SY", "ton", "gallon", "hour", "lot", "EA"] as const;

export interface MaterialItem {
  id: string;
  description: string;
  materialName: string;
  taskDescription: string;
  modelNumber: string | null;
  manufacturer: string | null;
  reasoning: string | null;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;
  confidence: "high" | "medium" | "low";
  confidenceNotes: string;
  costLow: number;
  costExpected: number;
  costHigh: number;
  source: { document: string; page: number };
  detail: {
    pricingMethod: string;
    sources: { name: string; url: string }[];
    notes: string;
  };
}

export interface LaborItem {
  id: string;
  description: string;
  crew: string;
  hours: number;
  hourlyRate: number;
  total: number;
  confidence: "high" | "medium" | "low";
  confidenceNotes: string;
  hoursLow: number;
  hoursExpected: number;
  hoursHigh: number;
  rateLow: number;
  rateExpected: number;
  rateHigh: number;
  source: { document: string; page: number };
  detail: {
    hoursBreakdown: string;
    productivityRate: string;
    reasoning: string;
    siteAdjustments: string[];
  };
}

export interface Anomaly {
  id: string;
  type: "priced_in" | "noted";
  category: string;
  description: string;
  affectedItems: string[];
  costImpact: number | null;
}
