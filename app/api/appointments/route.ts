import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { classifyAppointment, parseDuration } from "@/lib/classifier";
import { sanitizeAppointment, validateAppointmentInput } from "@/lib/appointments";
import { conflictsWithExisting, createFolio, readAppointments, writeAppointments } from "@/lib/store";
import type { Appointment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const appointments = await readAppointments();
  const query = (request.nextUrl.searchParams.get("q") || "").toLowerCase();
  const status = request.nextUrl.searchParams.get("status") || "";
  const priority = request.nextUrl.searchParams.get("priority") || "";
  const date = request.nextUrl.searchParams.get("date") || "";
  const filtered = appointments
    .filter((item) => !status || item.status === status)
    .filter((item) => !priority || item.classification?.priority === priority)
    .filter((item) => !date || item.scheduledAt.slice(0, 10) === date)
    .filter((item) => !query || [item.folio, item.clientName, item.phone, item.address, item.description].some((value) => value.toLowerCase().includes(query)))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return NextResponse.json({ appointments: filtered, total: filtered.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const validation = validateAppointmentInput(body);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const appointments = await readAppointments();
  const input = sanitizeAppointment(body);
  const classification = await classifyAppointment(input);
  const durationMin = parseDuration(classification, input.durationMin);
  const conflict = conflictsWithExisting(appointments, input.scheduledAt, durationMin);
  if (conflict) {
    return NextResponse.json({ error: "El técnico ya tiene una cita en ese horario", details: { conflictFolio: conflict.folio } }, { status: 409 });
  }
  const appointment: Appointment = {
    id: crypto.randomUUID(),
    folio: createFolio(appointments),
    createdAt: new Date().toISOString(),
    ...input,
    durationMin,
    classification,
    status: classification.requiresReview ? "Pendiente" : "Confirmada",
    technician: "Técnico principal",
    completedAt: null,
  };
  appointments.push(appointment);
  await writeAppointments(appointments);
  return NextResponse.json({ appointment }, { status: 201 });
}
