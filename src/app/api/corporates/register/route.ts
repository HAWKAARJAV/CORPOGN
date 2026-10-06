import { createCorporateSlug } from "@/lib/corporate";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SerializedValue =
  | string
  | { name: string; size: number; type: string }
  | SerializedValue[];

function getText(formData: Record<string, SerializedValue>, key: string) {
  const value = formData[key];
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join(", ");
  }
  return typeof value === "string" ? value.trim() : "";
}

function serializeFormData(entries: FormData) {
  const data: Record<string, SerializedValue> = {};

  entries.forEach((value, key) => {
    const serializedValue =
      value instanceof File
        ? value.name
          ? { name: value.name, size: value.size, type: value.type }
          : ""
        : value;

    if (key in data) {
      const current = data[key];
      data[key] = Array.isArray(current)
        ? [...current, serializedValue]
        : [current, serializedValue];
      return;
    }

    data[key] = serializedValue;
  });

  return data;
}

async function createUniqueSlug(companyName: string) {
  const baseSlug = createCorporateSlug(companyName);
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("corporates")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function POST(request: Request) {
  const requestFormData = await request.formData();
  const registrationData = serializeFormData(requestFormData);

  const companyName = getText(registrationData, "companyName");
  const companyEmail = getText(registrationData, "companyEmail");
  const workEmail = getText(registrationData, "workEmail");
  const password = getText(registrationData, "password");
  const confirmPassword = getText(registrationData, "confirmPassword");
  const email = workEmail || companyEmail;

  if (!companyName || !email || !password) {
    return Response.json(
      { error: "Company name, admin email, and password are required." },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return Response.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        company_name: companyName,
        account_type: "corporate",
      },
    });

  if (userError || !userData.user) {
    return Response.json(
      { error: userError?.message || "Could not create corporate user." },
      { status: 400 },
    );
  }

  try {
    const slug = await createUniqueSlug(companyName);
    const { error: corporateError } = await supabaseAdmin.from("corporates").insert({
      auth_user_id: userData.user.id,
      slug,
      company_name: companyName,
      company_email: email,
      access_status: "locked",
      registration_data: registrationData,
    });

    if (corporateError) {
      throw corporateError;
    }

    return Response.json({ slug });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save corporate registration.",
      },
      { status: 500 },
    );
  }
}
