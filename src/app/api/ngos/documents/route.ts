import { NextResponse } from "next/server";
import { getCaller, getNgoIdForUser } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createSignedNgoDocumentUrl,
  uploadNgoDocumentObject,
} from "@/lib/server/ngo-document-storage";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * POST — upload a compliance vault document (service-role storage + DB upsert).
 * Works for NGO primary login and ngo_member roles (compliance officers).
 */
export async function POST(request: Request) {
  const user = await getCaller(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ngoId = await getNgoIdForUser(user);
  if (!ngoId) return NextResponse.json({ error: "NGO record not found for this account." }, { status: 404 });

  const form = await request.formData();
  const docType = String(form.get("doc_type") ?? "").trim();
  const file = form.get("file");

  if (!docType) {
    return NextResponse.json({ error: "doc_type is required." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A non-empty file is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 25MB limit." }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const storagePath = `compliance/${ngoId}/${docType}/${Date.now()}-${safeName || `file.${ext}`}`;

  const buffer = await file.arrayBuffer();
  const { error: storageError } = await uploadNgoDocumentObject(storagePath, buffer, file.type);
  if (storageError) {
    return NextResponse.json(
      {
        error: `Storage upload failed. Ensure Supabase bucket "${"ngo-documents"}" exists (see supabase/sql/ngo-documents-storage-bucket.sql). Details: ${storageError}`,
      },
      { status: 500 },
    );
  }

  const { data, error: dbError } = await supabaseAdmin
    .from("ngo_documents")
    .upsert(
      {
        ngo_id: ngoId,
        doc_type: docType,
        storage_path: storagePath,
        status: "uploaded",
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "ngo_id,doc_type" },
    )
    .select("doc_type, storage_path, status")
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ document: data, storagePath });
}

/**
 * GET ?path=... — short-lived signed URL for viewing an uploaded compliance doc.
 */
export async function GET(request: Request) {
  const user = await getCaller(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ngoId = await getNgoIdForUser(user);
  if (!ngoId) return NextResponse.json({ error: "NGO record not found for this account." }, { status: 404 });

  const path = new URL(request.url).searchParams.get("path")?.trim();
  if (!path) return NextResponse.json({ error: "path query parameter is required." }, { status: 400 });

  const { data: owned } = await supabaseAdmin
    .from("ngo_documents")
    .select("id")
    .eq("ngo_id", ngoId)
    .eq("storage_path", path)
    .maybeSingle();

  if (!owned) {
    return NextResponse.json({ error: "Document not found for this NGO." }, { status: 404 });
  }

  const { signedUrl, error } = await createSignedNgoDocumentUrl(path);
  if (error || !signedUrl) {
    return NextResponse.json({ error: error ?? "Could not create signed URL." }, { status: 500 });
  }

  return NextResponse.json({ signedUrl });
}
