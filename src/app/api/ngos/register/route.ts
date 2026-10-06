import { createNgoSlug } from "@/lib/ngo";
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

async function createUniqueNgoSlug(ngoName: string) {
  const baseSlug = createNgoSlug(ngoName);
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("ngos")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) return slug;

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function POST(request: Request) {
  const requestFormData = await request.formData();
  const registrationData = serializeFormData(requestFormData);

  const ngoName = getText(registrationData, "ngoName");
  const officialNgoEmail = getText(registrationData, "officialNgoEmail");
  const workEmail = getText(registrationData, "workEmail");
  const password = getText(registrationData, "password");
  const confirmPassword = getText(registrationData, "confirmPassword");
  const email = workEmail || officialNgoEmail;

  if (!ngoName || !email || !password) {
    return Response.json(
      { error: "NGO name, admin email, and password are required." },
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
        ngo_name: ngoName,
        account_type: "ngo",
      },
    });

  if (userError || !userData.user) {
    return Response.json(
      { error: userError?.message || "Could not create NGO user." },
      { status: 400 },
    );
  }

  try {
    const slug = await createUniqueNgoSlug(ngoName);

    const ngoType = getText(registrationData, "ngoType");
    const stateVal = getText(registrationData, "state");
    const contactNumber = getText(registrationData, "contactNumber");
    const website = getText(registrationData, "ngoWebsite");
    const primaryFocus = getText(registrationData, "focusAreas");

    let { error: ngoError } = await supabaseAdmin.from("ngos").insert({
      auth_user_id: userData.user.id,
      slug,
      ngo_name: ngoName,
      ngo_email: email,
      access_status: "pending",
      has_project: false,
      trust_score: 0,
      ngo_type: ngoType,
      state: stateVal,
      contact_number: contactNumber,
      website: website,
      focus_areas: primaryFocus ? [primaryFocus] : [],
      registration_data: registrationData,
    });

    if (ngoError && (ngoError.message.includes("column") || ngoError.message.includes("schema cache") || ngoError.code === "PGRST205")) {
      console.warn("[Register NGO] Missing explicit profile columns in DB. Falling back to base columns only.");
      const retry = await supabaseAdmin.from("ngos").insert({
        auth_user_id: userData.user.id,
        slug,
        ngo_name: ngoName,
        ngo_email: email,
        access_status: "pending",
        has_project: false,
        trust_score: 0,
        registration_data: registrationData,
      });
      ngoError = retry.error;
    }

    if (ngoError) throw ngoError;

    return Response.json({ slug });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save NGO registration.",
      },
      { status: 500 },
    );
  }
}
