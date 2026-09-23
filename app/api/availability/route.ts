import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots, readAppointments } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || "";
  const duration = Number(request.nextUrl.searchParams.get("duration") || 60);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Indica una fecha válida" }, { status: 400 });
  return NextResponse.json({ date, slots: getAvailableSlots(await readAppointments(), date, duration) });
}
