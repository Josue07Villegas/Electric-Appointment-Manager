import { NextRequest, NextResponse } from "next/server";
import { classifyAppointment } from "@/lib/classifier";
import { readAppointments, saveAppointment } from "@/lib/store";
import { isAuthorizedStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorizedStaff())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await context.params;
  const appointments = await readAppointments();
  const index = appointments.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ error: "No se encontró la cita" }, { status: 404 });
  const original = appointments[index];
  const body = await request.json() as Record<string, unknown>;
  if (!Number.isInteger(body.expectedRevision)) return NextResponse.json({ error: "Recarga la cita antes de reclasificar" }, { status: 428 });
  if (body.expectedRevision !== original.revision) return NextResponse.json({ error: "La cita cambió en otra sesión. Cierra la ficha y vuelve a abrirla." }, { status: 409 });
  const classification = await classifyAppointment(appointments[index]);
  appointments[index] = {
    ...appointments[index],
    classification,
    revision: original.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    await saveAppointment(appointments[index], original);
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_APPOINTMENT") return NextResponse.json({ error: "La cita cambió. Recarga e intenta nuevamente." }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ appointment: appointments[index] });
}
