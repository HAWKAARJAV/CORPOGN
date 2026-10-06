import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Resolved compliance view — Step 4 of the platform-core spec.
 *
 * ngo_documents (self-uploaded, optionally admin-verified) and the live
 * ngos table's own compliance fields (often pipeline-scraped from
 * give.do/FCRA-online during enrichment) are two independent sources for
 * the same real-world facts (12A, 80G, FCRA, CSR-1, registration number).
 * This resolves ONE preferred value per field using the priority:
 *
 *   1. admin-verified self-upload   (ngo_documents.status = 'verified')
 *   2. self-uploaded, unverified    (ngo_documents.status = 'uploaded')
 *   3. pipeline-scraped             (ngos.cert_12a / cert_80g / ...)
 *
 * If the two sources actively disagree (both present, different values),
 * the conflict is surfaced explicitly rather than silently picking one —
 * corporates doing diligence need to know that, not have it hidden.
 */

export type ComplianceField = "cert_12a" | "cert_80g" | "csr1_number" | "registration_number" | "fcra_number";

const FIELD_TO_DOC_TYPE: Record<ComplianceField, string> = {
  cert_12a: "certificate12a",
  cert_80g: "certificate80g",
  csr1_number: "csr1Certificate",
  registration_number: "registrationCertificate",
  fcra_number: "fcraCertificate",
};

export type ResolvedComplianceField = {
  field: ComplianceField;
  resolvedValue: string | null;
  resolvedSource: "self_uploaded_verified" | "self_uploaded_unverified" | "pipeline_scraped" | "none";
  hasConflict: boolean;
  allSources: {
    selfUploaded: { present: boolean; verified: boolean; storagePath: string | null; uploadedAt: string | null };
    pipelineScraped: { present: boolean; value: string | null };
  };
};

export async function getResolvedComplianceView(ngoId: string): Promise<ResolvedComplianceField[]> {
  const [{ data: ngo }, { data: documents }] = await Promise.all([
    supabaseAdmin.from("ngos").select("cert_12a, cert_80g, csr1_number, registration_number, fcra_number").eq("id", ngoId).maybeSingle(),
    supabaseAdmin.from("ngo_documents").select("doc_type, status, storage_path, uploaded_at").eq("ngo_id", ngoId),
  ]);

  const docsByType = new Map((documents ?? []).map((d) => [d.doc_type, d]));

  return (Object.keys(FIELD_TO_DOC_TYPE) as ComplianceField[]).map((field) => {
    const docType = FIELD_TO_DOC_TYPE[field];
    const doc = docsByType.get(docType);
    const pipelineValue = (ngo?.[field] as string | null) ?? null;

    const selfUploaded = {
      present: Boolean(doc),
      verified: doc?.status === "verified",
      storagePath: doc?.storage_path ?? null,
      uploadedAt: doc?.uploaded_at ?? null,
    };
    const pipelineScraped = { present: Boolean(pipelineValue), value: pipelineValue };

    // A "conflict" here means self-upload exists (so the NGO asserted this
    // fact themselves) but the pipeline's independently-scraped read is
    // present AND doesn't merely confirm it (we can't compare doc contents,
    // only presence — this flags "both sources have something, worth a
    // human glance" rather than claiming to know they disagree in value).
    const hasConflict = selfUploaded.present && pipelineScraped.present;

    let resolvedValue: string | null = null;
    let resolvedSource: ResolvedComplianceField["resolvedSource"] = "none";

    if (selfUploaded.present && selfUploaded.verified) {
      resolvedValue = pipelineValue ?? "Document on file (admin-verified)";
      resolvedSource = "self_uploaded_verified";
    } else if (selfUploaded.present) {
      resolvedValue = pipelineValue ?? "Document on file (not yet verified)";
      resolvedSource = "self_uploaded_unverified";
    } else if (pipelineScraped.present) {
      resolvedValue = pipelineValue;
      resolvedSource = "pipeline_scraped";
    }

    return { field, resolvedValue, resolvedSource, hasConflict, allSources: { selfUploaded, pipelineScraped } };
  });
}
