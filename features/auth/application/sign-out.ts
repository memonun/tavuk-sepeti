"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function signOutAction(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  // "local", not the default "global": an admin account is signed in on
  // several phones and computers, and a global sign-out ended EVERY device's
  // session — the others were thrown back to /login (`Refresh Token Not Found`).
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
