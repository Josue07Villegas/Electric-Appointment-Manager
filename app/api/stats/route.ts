import { NextResponse } from "next/server";
import { computeStats, readAppointments } from "@/lib/store";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(computeStats(await readAppointments()));
}
