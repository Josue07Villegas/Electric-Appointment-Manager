import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedStaff } from "@/lib/auth";
import { readAppointments } from "@/lib/store";
import { computeKpis, inPeriod, schedulingExclusion, punctualityExclusion } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!(await isAuthorizedStaff())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if ([from, to].some(value => value !== null && !Number.isFinite(Date.parse(value))) || (from && to && Date.parse(from) >= Date.parse(to))) return NextResponse.json({ error: "Indica un intervalo ISO válido [from, to)" }, { status: 400 });
  const items = await readAppointments();
  const records = items.filter(item => inPeriod(item.createdAt, { from, to }) || inPeriod(item.arrivedAt || item.scheduledAt || item.createdAt, { from, to })).map(item => ({ inSchedulingCohort: inPeriod(item.createdAt, { from, to }), inVisitCohort: inPeriod(item.arrivedAt || item.scheduledAt || item.createdAt, { from, to }), folio: item.folio, createdAt: item.createdAt, firstConfirmedAt: item.firstConfirmedAt, arrivedAt: item.arrivedAt, arrivalScheduledAt: item.arrivalScheduledAt, scheduledAt: item.scheduledAt, status: item.status, schedulingExclusion: schedulingExclusion(item), punctualityExclusion: punctualityExclusion(item) }));
  return NextResponse.json({ generatedAt: new Date().toISOString(), period: { from, to, schedulingBasis: "createdAt", punctualityBasis: "arrivedAt; para exclusiones, scheduledAt o createdAt", endExclusive: true }, kpis: computeKpis(items, { from, to }), records }, { headers: { "Content-Disposition": 'attachment; filename="evaluacion-operativa.json"', "Cache-Control": "private, no-store" } });
}
