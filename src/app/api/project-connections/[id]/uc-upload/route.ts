import { NextResponse } from "next/server";
import { authorizeProjectAccess, getCaller } from "@/lib/access-control";
import { uploadNgoDocumentObject } from "@/lib/server/ngo-document-storage";

const MAX_BYTES = 20 * 1024 * 1024;

/** POST — upload UC PDF via service role (NGO primary or member with reports edit). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: connectionId } = await params;

  const user = await getCaller(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const access = await authorizeProjectAccess(user, connectionId, {
    area: "reports",
    action: "edit",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A non-empty file is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 20MB limit." }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
  const storagePath = `uc/${connectionId}/${Date.now()}-${safeName}`;
  const buffer = await file.arrayBuffer();
  const { error: storageError } = await uploadNgoDocumentObject(storagePath, buffer, file.type);
  if (storageError) {
    return NextResponse.json({ error: storageError }, { status: 500 });
  }

  return NextResponse.json({
    storageObjectId: storagePath,
    bucketName: "ngo-documents",
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  });
}
