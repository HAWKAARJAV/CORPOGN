/**
 * lib/supabase.mjs
 * Service-role Supabase client for the pipeline.
 * Bypasses RLS — all writes go through this client only.
 * Mirrors lib/supabase-admin.ts conventions.
 */

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./env.mjs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Log a step to research_logs (non-blocking — never throws).
 * @param {string} runId
 * @param {string} step
 * @param {string} message
 * @param {object} opts
 */
export async function logStep(runId, step, message, opts = {}) {
  const { entityType, entityRef, metadata = {}, severity = "info" } = opts;
  try {
    await supabase.from("research_logs").insert({
      run_id: runId,
      step,
      entity_type: entityType ?? null,
      entity_ref: entityRef ?? null,
      message,
      metadata,
      severity,
    });
  } catch {
    // Non-blocking: pipeline continues even if logging fails
  }
}
