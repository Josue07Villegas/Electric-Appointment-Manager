import type { Appointment, AppointmentStatus } from "./types";

export const allowedTransitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
    Pendiente: ["Pendiente", "Confirmada", "Cancelada"],
    Confirmada: ["Confirmada", "En camino", "En servicio", "Cancelada"],
    "En camino": ["En camino", "En servicio", "Cancelada"],
    "En servicio": ["En servicio", "Completada"],
    Completada: ["Completada"],
    Cancelada: ["Cancelada"],
};

export function lifecycleUpdate(original: Appointment, status: AppointmentStatus, scheduledAt: string | null, durationMin: number | null, now = new Date().toISOString()) {
  if (!allowedTransitions[original.status].includes(status)) return "La transición de estado no está permitida";
  if ((original.arrivedAt || ["Completada", "Cancelada"].includes(original.status)) && (scheduledAt !== original.scheduledAt || durationMin !== original.durationMin)) return "No se puede reprogramar una visita iniciada o cerrada";
  return {
    firstConfirmedAt: original.firstConfirmedAt || (original.status === "Pendiente" && status === "Confirmada" ? now : null),
    arrivedAt: original.arrivedAt || (status === "En servicio" && original.status !== "En servicio" ? now : null),
    arrivalScheduledAt: original.arrivalScheduledAt || (status === "En servicio" && original.status !== "En servicio" ? scheduledAt : null),
  };
}
