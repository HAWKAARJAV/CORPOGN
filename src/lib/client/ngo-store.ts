/**
 * Lightweight NGO shared state store.
 * Used to sync compliance docs, milestones, profile edits etc.
 * across Super Admin + all role dashboards within the same session.
 *
 * In production this would be backed by Supabase Realtime subscriptions.
 * For now it uses localStorage events so multiple tabs stay in sync.
 */

export type DocStatus = "missing" | "uploaded" | "verified";

export interface NgoSharedState {
  docs:       Record<string, DocStatus>;   // docId → status
  docPaths:   Record<string, string>;      // docId → storagePath
  milestones: Record<number, string>;      // milestoneId → status
  ngoName:    string;
  ngoEmail:   string;
  trustScore: number;
}

const STORAGE_KEY = "ngo_shared_state";

function defaultState(ngoName: string, ngoEmail: string, trustScore: number): NgoSharedState {
  return {
    docs:       {},
    docPaths:   {},
    milestones: { 1: "pending", 2: "pending", 3: "pending", 4: "pending" },
    ngoName,
    ngoEmail,
    trustScore,
  };
}

export function loadState(ngoId: string, ngoName: string, ngoEmail: string, trustScore: number): NgoSharedState {
  if (typeof window === "undefined") return defaultState(ngoName, ngoEmail, trustScore);
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${ngoId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as NgoSharedState;
      if (!parsed.docPaths) {
        parsed.docPaths = {};
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return defaultState(ngoName, ngoEmail, trustScore);
}

export function saveState(ngoId: string, state: NgoSharedState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_KEY}_${ngoId}`, JSON.stringify(state));
  // Notify other tabs
  window.dispatchEvent(new StorageEvent("storage", {
    key: `${STORAGE_KEY}_${ngoId}`,
    newValue: JSON.stringify(state),
  }));
}

/** Compute trust score from uploaded docs */
export function computeTrustScore(docs: Record<string, DocStatus>): number {
  const weights: Record<string, number> = {
    certificate12a:  20,
    certificate80g:  20,
    fcraCertificate: 15,
    csr1Certificate: 10,
    annualReport:    10,
    auditReport:     10,
  };
  let score = 15; // base score
  for (const [docId, status] of Object.entries(docs)) {
    if (status === "uploaded" || status === "verified") {
      score += weights[docId] ?? 0;
    }
  }
  return Math.min(score, 100);
}
