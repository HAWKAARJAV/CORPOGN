import { supabaseAdmin } from "@/lib/supabase-admin";

/** Private Supabase Storage bucket for compliance vault + workspace evidence (server uploads only). */
export const NGO_DOCUMENTS_BUCKET = "ngo-documents";

export async function uploadNgoDocumentObject(
  storagePath: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<{ error: string | null }> {
  const { error } = await supabaseAdmin.storage.from(NGO_DOCUMENTS_BUCKET).upload(storagePath, body, {
    upsert: true,
    contentType: contentType || "application/octet-stream",
  });
  return { error: error?.message ?? null };
}

export async function createSignedNgoDocumentUrl(
  storagePath: string,
  expiresInSeconds = 120,
): Promise<{ signedUrl: string | null; error: string | null }> {
  const { data, error } = await supabaseAdmin.storage
    .from(NGO_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  return { signedUrl: data?.signedUrl ?? null, error: error?.message ?? null };
}
