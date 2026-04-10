/**
 * Supabase-backed persistence for user settings and project overrides.
 *
 * All reads/writes go directly to Supabase (no API proxy).
 * Data is scoped per-user via RLS — each account only sees its own records.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Settings } from "@/lib/app-context";
import type { ProjectOverrides, MarkupData } from "@/types";

// ── User Settings ────────────────────────────────────────────────────────────

interface UserSettingsRow {
  settings: Record<string, unknown>;
  onboarding_complete: boolean;
}

/**
 * Fetch the authenticated user's settings from Supabase.
 * Returns { settings, onboarding_complete } or defaults if no row exists.
 */
export async function getUserSettings(
  userId: string,
): Promise<UserSettingsRow> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("settings, onboarding_complete")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.warn("[Estim8r] Failed to fetch user settings:", error.message);
    throw error;
  }

  if (!data) {
    return { settings: {}, onboarding_complete: false };
  }

  return {
    settings: typeof data.settings === "object" && data.settings !== null
      ? (data.settings as Record<string, unknown>)
      : {},
    onboarding_complete: Boolean(data.onboarding_complete),
  };
}

/**
 * Upsert user settings and/or onboarding status.
 * Merges with existing row — only updates provided fields.
 */
export async function saveUserSettings(
  userId: string,
  data: { settings?: Settings; onboarding_complete?: boolean },
): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (data.settings !== undefined) {
    row.settings = data.settings;
  }
  if (data.onboarding_complete !== undefined) {
    row.onboarding_complete = data.onboarding_complete;
  }

  const { error } = await supabase
    .from("user_preferences")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    if (import.meta.env.DEV) console.warn("[Estim8r] Failed to save user settings:", error.message);
    throw error;
  }
}

// ── Project Overrides ────────────────────────────────────────────────────────

const EMPTY_OVERRIDES: ProjectOverrides = { material: {}, labor: {} };

/**
 * Fetch per-project overrides from Supabase.
 * Returns { material, labor, markupPercent?, ... } or empty defaults.
 */
export async function getProjectOverrides(
  projectId: string,
): Promise<ProjectOverrides> {
  const { data, error } = await supabase
    .from("project_overrides")
    .select("overrides_data")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.warn("[Estim8r] Failed to fetch project overrides:", error.message);
    return EMPTY_OVERRIDES;
  }

  if (!data || !data.overrides_data) {
    return EMPTY_OVERRIDES;
  }

  const raw = data.overrides_data as Record<string, unknown>;
  return {
    material: (raw.material as ProjectOverrides["material"]) ?? {},
    labor: (raw.labor as ProjectOverrides["labor"]) ?? {},
    markupPercent: typeof raw.markupPercent === "number" ? raw.markupPercent : undefined,
    overheadPercent: typeof raw.overheadPercent === "number" ? raw.overheadPercent : undefined,
    contingencyPercent: typeof raw.contingencyPercent === "number" ? raw.contingencyPercent : undefined,
    taxPercent: typeof raw.taxPercent === "number" ? raw.taxPercent : undefined,
    waste_items: (raw.waste_items && typeof raw.waste_items === "object") ? raw.waste_items as Record<string, boolean> : undefined,
    waste_default_percent: typeof raw.waste_default_percent === "number" ? raw.waste_default_percent : undefined,
    waste_custom_percent: (raw.waste_custom_percent && typeof raw.waste_custom_percent === "object") ? raw.waste_custom_percent as Record<string, number> : undefined,
  };
}

/**
 * Upsert per-project overrides to Supabase.
 * Requires userId to satisfy RLS (auth.uid() = user_id).
 */
export async function saveProjectOverrides(
  projectId: string,
  userId: string,
  overrides: ProjectOverrides,
): Promise<void> {
  const { error } = await supabase
    .from("project_overrides")
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        overrides_data: overrides,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );

  if (error) {
    if (import.meta.env.DEV) console.warn("[Estim8r] Failed to save project overrides:", error.message);
    throw error;
  }
}

// ── Per-Line-Item Markup ────────────────────────────────────────────────────

const EMPTY_MARKUP: MarkupData = { material: {}, labor: {} };

/**
 * Fetch per-project item markup data from the dedicated markup_data column.
 */
export async function getMarkupData(
  projectId: string,
): Promise<MarkupData> {
  const { data, error } = await supabase
    .from("project_overrides")
    .select("markup_data")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.warn("[Estim8r] Failed to fetch markup data:", error.message);
    return EMPTY_MARKUP;
  }

  if (!data || !data.markup_data) {
    return EMPTY_MARKUP;
  }

  const raw = data.markup_data as Record<string, unknown>;
  return {
    material: (raw.material as MarkupData["material"]) ?? {},
    labor: (raw.labor as MarkupData["labor"]) ?? {},
  };
}

/**
 * Upsert per-project item markup data to the dedicated markup_data column.
 */
export async function saveMarkupData(
  projectId: string,
  userId: string,
  markupData: MarkupData,
): Promise<void> {
  const { error } = await supabase
    .from("project_overrides")
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        markup_data: markupData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );

  if (error) {
    if (import.meta.env.DEV) console.warn("[Estim8r] Failed to save markup data:", error.message);
    throw error;
  }
}
