// Create or update an admin user via Supabase Auth admin API.
//
// Usage:
//   node --env-file=.env scripts/create-admin.mjs <email> <password>
//
// Idempotent: re-running with the same email updates the password rather
// than failing on the unique-email constraint.

import { createClient } from "@supabase/supabase-js";

const [, , email, password] = process.argv;
if (!email || !password) {
  process.stderr.write("usage: create-admin.mjs <email> <password>\n");
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  process.stderr.write("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY\n");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Look up existing user by email — listUsers paginates 50 at a time, fine
// for our scale.
const { data: list, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (listError) {
  process.stderr.write(`listUsers failed: ${listError.message}\n`);
  process.exit(1);
}
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  const { error } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    process.stderr.write(`updateUserById failed: ${error.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`updated existing user ${existing.id} (${email})\n`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    process.stderr.write(`createUser failed: ${error.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`created user ${data.user?.id} (${email})\n`);
}

// Verify migration-014 trigger created the app_users row.
const { data: appUser, error: appUserError } = await supabase
  .from("app_users")
  .select("id, role")
  .eq("id", existing?.id ?? (await supabase.auth.admin.listUsers()).data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id)
  .single();

if (appUserError) {
  process.stderr.write(`app_users lookup failed: ${appUserError.message}\n`);
  process.exit(1);
}
process.stdout.write(`app_users row: id=${appUser.id} role=${appUser.role}\n`);
