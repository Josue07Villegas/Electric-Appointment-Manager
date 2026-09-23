import { NextRequest, NextResponse } from "next/server";
import { normalizeText, validateAppointmentInput } from "@/lib/appointments";
import { conflictsWithExisting, readAppointments, writeAppointments } from "@/lib/store";
import type { AppointmentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, context: Context) {
  const { id } = await context.params;
  const appointment = (await readAppointments()).find((item) => item.id === id);
  return appointment
    ? NextResponse.json({ appointment })
    : NextResponse.json({ error: "No se encontró la cita" }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const validation = validateAppointmentInput(body, true);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const appointments = await readAppointments();
  const index = appointments.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ error: "No se encontró la cita" }, { status: 404 });
  const original = appointments[index];
  const status = body.status as AppointmentStatus | undefined;
  const updated = {
    ...original,
    ...(status ? { status } : {}),
    ...(body.notes !== undefined ? { notes: normalizeText(body.notes, 1000) } : {}),
    ...(body.scheduledAt ? { scheduledAt: new Date(String(body.scheduledAt)).toISOString() } : {}),
    ...(body.durationMin ? { durationMin: Number(body.durationMin) } : {}),
    updatedAt: new Date().toISOString(),
    completedAt: status === "Completada" ? original.completedAt || new Date().toISOString() : status ? null : original.completedAt,
  };
  const conflict = conflictsWithExisting(appointments, updated.scheduledAt, updated.durationMin, id);
  if (conflict && updated.status !== "Cancelada") return NextResponse.json({ error: "El nuevo horario se cruza con otra cita" }, { status: 409 });
  appointments[index] = updated;
  await writeAppointments(appointments);
  return NextResponse.json({ appointment: updated });
}
