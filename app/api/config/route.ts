import { NextResponse } from "next/server";
import { jevConfig } from "@/lib/classifier";
import { businessHours } from "@/lib/store";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ jevEnabled: jevConfig.enabled, model: jevConfig.model, technicianCount: 1, businessHours });
}
