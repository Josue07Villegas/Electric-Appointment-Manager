import { NextResponse } from "next/server";
import { jevConfig } from "@/lib/classifier";
import { businessHours } from "@/lib/store";
import { isAuthorizedStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await isAuthorizedStaff())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ jevEnabled: jevConfig.enabled, model: jevConfig.model, technicianCount: 1, businessHours, timezone: "America/Monterrey" });
}
