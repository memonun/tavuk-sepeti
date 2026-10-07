import { createSupabaseServerClient } from "@/shared/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = await createSupabaseServerClient();

    const completed_at = body.completed ? new Date().toISOString() : null;

    const { error } = await supabase
      .from("agenda_tasks")
      .update({ completed_at })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Görev güncellenemedi" },
      { status: 500 }
    );
  }
}
