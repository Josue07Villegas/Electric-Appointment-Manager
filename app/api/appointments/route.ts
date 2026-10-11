import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { classifyAppointment } from "@/lib/classifier";
import { sanitizeAppointment, validateAppointmentInput } from "@/lib/appointments";
import { conflictsWithExisting, createFolio, isWithinBusinessHours, readAppointments, writeAppointments } from "@/lib/store";
import type { Appointment } from "@/lib/types";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await auth())) return NextResponse.json({ error: "Inicia sesión para acceder al despacho" }, { status: 401 });
  const appointments = await readAppointments();
  const query = (request.nextUrl.searchParams.get("q") || "").toLowerCase();
  const status = request.nextUrl.searchParams.get("status") || "";
  const priority = request.nextUrl.searchParams.get("priority") || "";
  const date = request.nextUrl.searchParams.get("date") || "";
  const filtered = appointments
    .filter((item) => !status || item.status === status)
    .filter((item) => !priority || item.classification?.priority === priority)
    .filter((item) => !date || item.scheduledAt?.slice(0, 10) === date)
    .filter((item) => !query || [item.folio, item.clientName, item.phone, item.address, item.description].some((value) => value.toLowerCase().includes(query)))
    .sort((a, b) => (a.scheduledAt || "").localeCompare(b.scheduledAt || ""));
  return NextResponse.json({ appointments: filtered, total: filtered.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const validation = validateAppointmentInput(body);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const session = await auth();
  const internalScheduling = Boolean(session && body.scheduledAt);
  if (body.scheduledAt && !session) return NextResponse.json({ error: "No autorizado para asignar horarios" }, { status: 401 });
  if (internalScheduling && (![30, 60, 90, 120].includes(Number(body.durationMin)) || Number.isNaN(new Date(String(body.scheduledAt)).getTime()))) return NextResponse.json({ error: "Indica horario y duración válidos" }, { status: 400 });
  if (internalScheduling && !isWithinBusinessHours(String(body.scheduledAt), Number(body.durationMin))) return NextResponse.json({ error: "El horario debe quedar entre lunes y sábado, de 9:00 a 19:00" }, { status: 400 });
  const appointments = await readAppointments();
  const input = sanitizeAppointment(body);
  const classification = await classifyAppointment(input);
  const scheduledAt = internalScheduling ? new Date(String(body.scheduledAt)).toISOString() : null;
  const durationMin = internalScheduling ? Number(body.durationMin) : null;
  const conflict = scheduledAt && durationMin ? conflictsWithExisting(appointments, scheduledAt, durationMin) : undefined;
  if (conflict) return NextResponse.json({ error: "El nuevo horario se cruza con otra cita", details: { conflictFolio: conflict.folio } }, { status: 409 });
  const appointment: Appointment = {
    id: crypto.randomUUID(),
    folio: createFolio(appointments),
    createdAt: new Date().toISOString(),
    ...input,
    scheduledAt,
    durationMin,
    preferredSlots: input.preferredSlots,
    classification,
    status: internalScheduling ? "Confirmada" : "Pendiente",
    technician: "Técnico principal",
    completedAt: null,
  };
  appointments.push(appointment);
  try {
    await writeAppointments(appointments);
  } catch (error) {
    if (error instanceof Error && (error.message.includes("appointments_scheduled_no_overlap") || error.message.includes("appointment time conflict"))) return NextResponse.json({ error: "El nuevo horario se cruza con otra cita" }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ appointment }, { status: 201 });
}
