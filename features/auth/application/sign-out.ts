"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function signOutAction(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
