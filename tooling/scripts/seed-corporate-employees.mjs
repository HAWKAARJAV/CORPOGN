import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const defaultPassword = "Employee@2026";

const employees = [
  {
    fullName: "Ananya Sharma",
    email: "ananya.sharma@corporate-giant.example",
    position: "CSR Manager",
    pages: [
      "Dashboard",
      "Master Analytics",
      "Campaign Management",
      "NGO Management",
      "Reports & Approvals",
      "Employees & Access",
      "Notifications",
    ],
  },
  {
    fullName: "Rohan Mehta",
    email: "rohan.mehta@corporate-giant.example",
    position: "Finance Manager",
    pages: [
      "Dashboard",
      "Budget & Fund Tracking",
      "Reports & Approvals",
      "Audit & Compliance",
      "Notifications",
    ],
  },
  {
    fullName: "Priya Nair",
    email: "priya.nair@corporate-giant.example",
    position: "Compliance Officer",
    pages: [
      "Dashboard",
      "Reports & Approvals",
      "Audit & Compliance",
      "Notifications",
    ],
  },
  {
    fullName: "Kabir Khan",
    email: "kabir.khan@corporate-giant.example",
    position: "NGO Manager",
    pages: [
      "Dashboard",
      "Campaign Management",
      "NGO Management",
      "Reports & Approvals",
      "Notifications",
    ],
  },
  {
    fullName: "Sara Iyer",
    email: "sara.iyer@corporate-giant.example",
    position: "ESG Officer",
    pages: [
      "Dashboard",
      "ESG & Impact",
      "Reports & Approvals",
      "Master Analytics",
      "Notifications",
    ],
  },
];

const { data: corporate, error: corporateError } = await supabase
  .from("corporates")
  .select("id, slug")
  .eq("slug", "corporate-giant")
  .single();

if (corporateError || !corporate) {
  throw new Error(corporateError?.message || "Corporate Giant was not found.");
}

const { error: tableError } = await supabase
  .from("corporate_employees")
  .select("id", { count: "exact", head: true });

let tableReady = !tableError;

if (!tableReady) {
  console.log(
    `corporate_employees table is not ready; seeding Auth users only. ${tableError.message}`,
  );
}

const { data: userList, error: userListError } =
  await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

if (userListError) {
  throw new Error(userListError.message);
}

for (const employee of employees) {
  const existingUser = userList.users.find((user) => user.email === employee.email);
  const user =
    existingUser ??
    (
      await supabase.auth.admin.createUser({
        email: employee.email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
          full_name: employee.fullName,
          account_type: "corporate_employee",
          position: employee.position,
          corporate_id: corporate.id,
          corporate_slug: corporate.slug,
          allowed_pages: employee.pages,
        },
      })
    ).data.user;

  if (!user) {
    throw new Error(`Could not create auth user for ${employee.email}.`);
  }

  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      full_name: employee.fullName,
      account_type: "corporate_employee",
      position: employee.position,
      corporate_id: corporate.id,
      corporate_slug: corporate.slug,
      allowed_pages: employee.pages,
    },
  });

  if (tableReady) {
    const { error } = await supabase.from("corporate_employees").upsert(
      {
        corporate_id: corporate.id,
        auth_user_id: user.id,
        email: employee.email,
        full_name: employee.fullName,
        position: employee.position,
        allowed_pages: employee.pages,
        is_active: true,
      },
      { onConflict: "email" },
    );

    if (
      error?.message?.includes("corporate_employees") &&
      error.message.includes("schema cache")
    ) {
      tableReady = false;
      console.log(`${employee.email} seeded in Auth metadata only`);
      continue;
    }

    if (error) {
      throw new Error(`${employee.email}: ${error.message}`);
    }
  }

  console.log(`${employee.email} seeded`);
}

console.log(`Password for seeded employees: ${defaultPassword}`);
if (!tableReady) {
  console.log("Employees will load from Auth metadata until the table is applied.");
}
