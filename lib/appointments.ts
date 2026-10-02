import type { AppointmentInput, AppointmentStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";

export function normalizeText(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function validateAppointmentInput(body: Record<string, unknown>, partial = false) {
  const required = ["clientName", "phone", "address", "propertyType", "description", "scheduledAt"];
  if (!partial) {
    const missing = required.filter((field) => !normalizeText(body[field]));
    if (missing.length) return `Faltan campos obligatorios: ${missing.join(", ")}`;
  }
  if (body.scheduledAt && Number.isNaN(new Date(String(body.scheduledAt)).getTime())) return "La fecha de la cita no es válida";
  if (body.status && !STATUSES.includes(body.status as AppointmentStatus)) return "El estado no es válido";
  if (body.durationMin !== undefined) {
    const duration = Number(body.durationMin);
    if (![30, 60, 90, 120].includes(duration)) return "La duración de la cita no es válida";
  }
  return null;
}

export function sanitizeAppointment(body: Record<string, unknown>): AppointmentInput {
  const risk = (body.riskSignals || {}) as Record<string, unknown>;
  return {
    clientName: normalizeText(body.clientName, 100),
    phone: normalizeText(body.phone, 30),
    email: normalizeText(body.email, 150),
    address: normalizeText(body.address, 250),
    propertyType: normalizeText(body.propertyType, 50),
    requestedService: normalizeText(body.requestedService || "Diagnóstico eléctrico", 80),
    description: normalizeText(body.description, 1200),
    scheduledAt: new Date(String(body.scheduledAt)).toISOString(),
    riskSignals: {
      sparks: Boolean(risk.sparks),
      smoke: Boolean(risk.smoke),
      burningSmell: Boolean(risk.burningSmell),
      totalPowerLoss: Boolean(risk.totalPowerLoss),
    },
    notes: normalizeText(body.notes, 1000),
    durationMin: Number(body.durationMin) || undefined,
  };
}
