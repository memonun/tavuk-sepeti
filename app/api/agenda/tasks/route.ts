import { createSupabaseServerClient } from "@/shared/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const searchParams = request.nextUrl.searchParams;
    const completed = searchParams.get("completed");

    let query = supabase
      .from("agenda_tasks")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter by completion status if specified
    if (completed === "true") {
      query = query.not("completed_at", "is", null);
    } else if (completed === "false") {
      query = query.is("completed_at", null);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: "Görevler yüklenemedi" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = await request.json();

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const { error, data } = await supabase
      .from("agenda_tasks")
      .insert({
        title: body.title,
        notes: body.notes || null,
        category: body.category,
        due_date: body.due_date || null,
        repeat_unit: body.repeat_unit || null,
        repeat_every: body.repeat_every || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Görev eklenemedi" },
      { status: 500 }
    );
  }
}
