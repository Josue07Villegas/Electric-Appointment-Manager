import { NextResponse } from "next/server";
import { computeStats, readAppointments } from "@/lib/store";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await auth())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(computeStats(await readAppointments()));
}
