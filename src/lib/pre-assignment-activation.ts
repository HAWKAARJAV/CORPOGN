/** Fields on pre_assignments that gate admin workspace activation (Step 8). */
export type PreAssignmentConfirmFields = {
  corporate_confirmed_at?: string | null;
  ngo_confirmed_at?: string | null;
  activated_at?: string | null;
};

export type PreAssignmentActivationUiState =
  | "workspace_live"
  | "ready_to_activate"
  | "waiting_corporate"
  | "waiting_ngo"
  | "waiting_both";

export function preAssignmentActivationUiState(
  p: PreAssignmentConfirmFields,
): PreAssignmentActivationUiState {
  if (p.activated_at) return "workspace_live";
  const corp = Boolean(p.corporate_confirmed_at);
  const ngo = Boolean(p.ngo_confirmed_at);
  if (corp && ngo) return "ready_to_activate";
  if (!corp && !ngo) return "waiting_both";
  if (!corp) return "waiting_corporate";
  return "waiting_ngo";
}

export function canAdminActivatePreAssignment(p: PreAssignmentConfirmFields): boolean {
  return preAssignmentActivationUiState(p) === "ready_to_activate";
}

export function preAssignmentActivationHint(state: PreAssignmentActivationUiState): string {
  switch (state) {
    case "workspace_live":
      return "Workspace is live — no further activation needed.";
    case "ready_to_activate":
      return "Both sides confirmed partnership — you can activate the shared workspace.";
    case "waiting_corporate":
      return "Waiting for corporate to confirm partnership in My Projects (not meeting RSVP).";
    case "waiting_ngo":
      return "Waiting for NGO to confirm partnership on their dashboard.";
    case "waiting_both":
      return "Waiting for corporate and NGO to confirm partnership.";
    default:
      return "";
  }
}
