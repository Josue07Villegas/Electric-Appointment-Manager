import { NextRequest, NextResponse } from "next/server";
import { normalizeText, validateAppointmentInput } from "@/lib/appointments";
import { conflictsWithExisting, isWithinBusinessHours, readAppointments, writeAppointments } from "@/lib/store";
import type { AppointmentStatus } from "@/lib/types";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, context: Context) {
  if (!(await auth())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await context.params;
  const appointment = (await readAppointments()).find((item) => item.id === id);
  return appointment
    ? NextResponse.json({ appointment })
    : NextResponse.json({ error: "No se encontró la cita" }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!(await auth())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const validation = validateAppointmentInput(body, true);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const appointments = await readAppointments();
  const index = appointments.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ error: "No se encontró la cita" }, { status: 404 });
  const original = appointments[index];
  const status = body.status as AppointmentStatus | undefined;
  const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)).toISOString() : original.scheduledAt;
  const durationMin = body.durationMin !== undefined ? Number(body.durationMin) : original.durationMin;
  const nextStatus = status || original.status;
  if (["Confirmada", "En camino", "En servicio", "Completada"].includes(nextStatus) && (!scheduledAt || !durationMin)) return NextResponse.json({ error: "Asigna fecha, hora y duración antes de confirmar" }, { status: 400 });
  const scheduleChanged = body.scheduledAt !== undefined || body.durationMin !== undefined;
  if (nextStatus !== "Cancelada" && scheduleChanged && scheduledAt && durationMin && !isWithinBusinessHours(scheduledAt, durationMin)) return NextResponse.json({ error: "El horario debe quedar entre lunes y sábado, de 9:00 a 19:00" }, { status: 400 });
  const updated = {
    ...original,
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
    await writeAppointments(appointments);
  } catch (error) {
    if (error instanceof Error && (error.message.includes("appointments_scheduled_no_overlap") || error.message.includes("appointment time conflict"))) return NextResponse.json({ error: "El nuevo horario se cruza con otra cita" }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ appointment: updated });
}
