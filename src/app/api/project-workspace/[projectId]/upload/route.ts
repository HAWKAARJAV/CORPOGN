import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { uploadNgoDocumentObject } from "@/lib/server/ngo-document-storage";
import { resolveProjectWorkspaceAccess } from "@/lib/server/project-workspace-access";

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * POST multipart — upload file to storage and record workspace_documents row.
 * Requires edit access on the documents module (or admin / owning org).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const access = await resolveProjectWorkspaceAccess(request, projectId, "documents");
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.permission !== "edit") {
    return NextResponse.json({ error: "You have read-only access to documents." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const docType = String(form.get("doc_type") ?? "evidence").trim() || "evidence";

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A non-empty file is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 50MB limit." }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
  const storagePath = `workspace/${projectId}/${docType}/${Date.now()}-${safeName}`;

  const buffer = await file.arrayBuffer();
  const { error: storageError } = await uploadNgoDocumentObject(storagePath, buffer, file.type);
  if (storageError) {
    return NextResponse.json(
      {
        error: `Storage upload failed. Ensure Supabase bucket "ngo-documents" exists. Details: ${storageError}`,
      },
      { status: 500 },
    );
  }

  const { data, error: insertError } = await supabaseAdmin
    .from("workspace_documents")
    .insert({
      project_id: projectId,
      doc_type: docType,
      storage_path: storagePath,
      uploaded_by: access.user.id,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const actorType = access.context.accountType === "ngo_member" ? "ngo_worker" : access.context.accountType;
  await supabaseAdmin.from("activity_logs").insert({
    project_id: projectId,
    module: "documents",
    action: "created",
    actor_type: actorType,
    actor_id: access.user.id,
    detail: { record_id: data.id, storage_path: storagePath },
  });

  return NextResponse.json({ item: data, storagePath });
}
