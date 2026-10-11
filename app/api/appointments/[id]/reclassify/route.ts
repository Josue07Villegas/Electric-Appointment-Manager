import { NextRequest, NextResponse } from "next/server";
import { classifyAppointment } from "@/lib/classifier";
import { readAppointments, writeAppointments } from "@/lib/store";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await auth())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await context.params;
  const appointments = await readAppointments();
  const index = appointments.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ error: "No se encontró la cita" }, { status: 404 });
  const classification = await classifyAppointment(appointments[index]);
  appointments[index] = {
    ...appointments[index],
    classification,
    updatedAt: new Date().toISOString(),
  };
  await writeAppointments(appointments);
  return NextResponse.json({ appointment: appointments[index] });
}
