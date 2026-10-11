import type { AppointmentInput, AppointmentStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";

export function normalizeText(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function validateAppointmentInput(body: Record<string, unknown>, partial = false) {
  const required = ["clientName", "phone", "address", "propertyType", "description"];
  if (!partial) {
    const missing = required.filter((field) => !normalizeText(body[field]));
    if (missing.length) return `Faltan campos obligatorios: ${missing.join(", ")}`;
    if (!body.scheduledAt && (!Array.isArray(body.preferredSlots) || body.preferredSlots.length < 1)) return "Indica al menos una preferencia de horario";
  }
  if (body.preferredSlots !== undefined) {
    if (!Array.isArray(body.preferredSlots) || body.preferredSlots.length < 1 || body.preferredSlots.length > 3) return "Indica de una a tres preferencias de horario";
    if (body.preferredSlots.some((value) => typeof value !== "string" || Number.isNaN(new Date(value).getTime()))) return "Una preferencia de horario no es válida";
  }
  if (body.scheduledAt !== undefined && body.scheduledAt !== null && Number.isNaN(new Date(String(body.scheduledAt)).getTime())) return "La fecha de la cita no es válida";
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
    preferredSlots: Array.isArray(body.preferredSlots) ? body.preferredSlots.slice(0, 3).map((value) => new Date(String(value)).toISOString()) : [],
    riskSignals: {
      sparks: Boolean(risk.sparks),
      smoke: Boolean(risk.smoke),
      burningSmell: Boolean(risk.burningSmell),
      totalPowerLoss: Boolean(risk.totalPowerLoss),
    },
    notes: normalizeText(body.notes, 1000),
  };
}
