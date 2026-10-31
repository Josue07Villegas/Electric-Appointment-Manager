import { NextRequest, NextResponse } from "next/server";
import { lifecycleUpdate } from "@/lib/lifecycle";
import { normalizeText, validateAppointmentInput } from "@/lib/appointments";
import { conflictsWithExisting, isWithinBusinessHours, readAppointments, saveAppointment } from "@/lib/store";
import type { AppointmentStatus } from "@/lib/types";
import { isAuthorizedStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, context: Context) {
  if (!(await isAuthorizedStaff())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await context.params;
  const appointment = (await readAppointments()).find((item) => item.id === id);
  return appointment
    ? NextResponse.json({ appointment })
    : NextResponse.json({ error: "No se encontró la cita" }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!(await isAuthorizedStaff())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const validation = validateAppointmentInput(body, true);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const appointments = await readAppointments();
  const index = appointments.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ error: "No se encontró la cita" }, { status: 404 });
  const original = appointments[index];
  if (!Number.isInteger(body.expectedRevision)) return NextResponse.json({ error: "Recarga la cita antes de guardar" }, { status: 428 });
  if (body.expectedRevision !== original.revision) return NextResponse.json({ error: "La cita cambió en otra sesión. Cierra la ficha y vuelve a abrirla." }, { status: 409 });
  const status = body.status as AppointmentStatus | undefined;
  const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)).toISOString() : original.scheduledAt;
  const durationMin = body.durationMin !== undefined ? Number(body.durationMin) : original.durationMin;
  const nextStatus = status || original.status;
  if (["Confirmada", "En camino", "En servicio", "Completada"].includes(nextStatus) && (!scheduledAt || !durationMin)) return NextResponse.json({ error: "Asigna fecha, hora y duración antes de confirmar" }, { status: 400 });
  const scheduleChanged = body.scheduledAt !== undefined || body.durationMin !== undefined || (original.status === "Pendiente" && nextStatus === "Confirmada");
  if (nextStatus !== "Cancelada" && scheduleChanged && scheduledAt && durationMin && !isWithinBusinessHours(scheduledAt, durationMin)) return NextResponse.json({ error: "El horario debe quedar entre lunes y sábado, de 9:00 a 19:00" }, { status: 400 });
  const lifecycle = lifecycleUpdate(original, nextStatus, scheduledAt, durationMin);
  if (typeof lifecycle === "string") return NextResponse.json({ error: lifecycle }, { status: 400 });
  const updated = {
    ...original,
    ...lifecycle,
    revision: original.revision + 1,
    ...(status ? { status } : {}),
    ...(body.notes !== undefined ? { notes: normalizeText(body.notes, 1000) } : {}),
    scheduledAt,
    durationMin,
    updatedAt: new Date().toISOString(),
    completedAt: status === "Completada" ? original.completedAt || new Date().toISOString() : status ? null : original.completedAt,
  };
  const conflict = updated.scheduledAt && updated.durationMin ? conflictsWithExisting(appointments, updated.scheduledAt, updated.durationMin, id) : undefined;
  if (conflict && ["Confirmada", "En camino", "En servicio"].includes(updated.status)) return NextResponse.json({ error: "El nuevo horario se cruza con otra cita" }, { status: 409 });
  appointments[index] = updated;
  try {
    await saveAppointment(updated, original);
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_APPOINTMENT") return NextResponse.json({ error: "La cita cambió en otra sesión. Recarga e intenta nuevamente." }, { status: 409 });
    if (error instanceof Error && (error.message.includes("appointments_scheduled_no_overlap") || error.message.includes("appointment time conflict"))) return NextResponse.json({ error: "El nuevo horario se cruza con otra cita" }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ appointment: updated });
}
