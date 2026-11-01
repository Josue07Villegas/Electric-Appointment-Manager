import type { Appointment, OperationalKpis } from "./types";
import { PRIORITIES } from "./types";

export function compareAppointments(a: Appointment, b: Appointment) {
  if (a.status === "Pendiente" && b.status !== "Pendiente") return -1;
  if (b.status === "Pendiente" && a.status !== "Pendiente") return 1;
  if (a.status === "Pendiente") return PRIORITIES.indexOf(a.classification.priority) - PRIORITIES.indexOf(b.classification.priority) || a.createdAt.localeCompare(b.createdAt);
  return (a.scheduledAt || a.createdAt).localeCompare(b.scheduledAt || b.createdAt) || a.id.localeCompare(b.id);
}

export type MetricPeriod = { from?: string | null; to?: string | null };
export function schedulingExclusion(item: Appointment): string | null {
  if (!item.firstConfirmedAt) return item.status === "Cancelada" ? "cancelada_sin_confirmacion_verificable" : item.status === "Pendiente" ? "pendiente" : "sin_primera_confirmacion_verificable";
  const minutes = (Date.parse(item.firstConfirmedAt) - Date.parse(item.createdAt)) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? null : "tiempos_invalidos";
}
export function punctualityExclusion(item: Appointment): string | null {
  if (!["En servicio", "Completada"].includes(item.status)) return item.status === "Cancelada" ? "cancelada" : "visita_no_realizada";
  if (!item.arrivedAt || !item.arrivalScheduledAt || !Number.isFinite(Date.parse(item.arrivedAt)) || !Number.isFinite(Date.parse(item.arrivalScheduledAt))) return "sin_llegada_u_horario_verificables";
  const arrival = Date.parse(item.arrivedAt);
  if (!Number.isFinite(Date.parse(item.createdAt)) || arrival < Date.parse(item.createdAt) || (item.firstConfirmedAt && (!Number.isFinite(Date.parse(item.firstConfirmedAt)) || arrival < Date.parse(item.firstConfirmedAt)))) return "tiempos_invalidos";
  return null;
}
export function inPeriod(value: string, period: MetricPeriod) {
  return (!period.from || Date.parse(value) >= Date.parse(period.from)) && (!period.to || Date.parse(value) < Date.parse(period.to));
}
function reasons(items: Appointment[], exclude: (item: Appointment) => string | null) {
  const counts: Record<string, number> = {};
  for (const item of items) { const reason = exclude(item); if (reason) counts[reason] = (counts[reason] || 0) + 1; }
  return counts;
}
export function computeKpis(items: Appointment[], period: MetricPeriod = {}): OperationalKpis {
  const requests = items.filter(item => inPeriod(item.createdAt, period));
  const visitCohort = items.filter(item => inPeriod(item.arrivedAt || item.scheduledAt || item.createdAt, period));
  const times = requests.filter(item => !schedulingExclusion(item)).map(item => (Date.parse(item.firstConfirmedAt!) - Date.parse(item.createdAt)) / 60000);
  const visits = visitCohort.filter(item => !punctualityExclusion(item));
  // The agreed time is the start of the appointment; no undocumented grace period.
  const punctual = visits.filter(item => Date.parse(item.arrivedAt!) <= Date.parse(item.arrivalScheduledAt!)).length;
  const average = times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : null;
  const percent = visits.length ? punctual / visits.length * 100 : null;
  return {
    scheduling: { averageMinutes: average, valid: times.length, excluded: requests.length - times.length, exclusionReasons: reasons(requests, schedulingExclusion), reductionPercent: average === null ? null : (30.4 - average) / 30.4 * 100, targetMet: average === null ? null : average <= 19.5 },
    punctuality: { percent, valid: visits.length, punctual, excluded: visitCohort.length - visits.length, exclusionReasons: reasons(visitCohort, punctualityExclusion), increasePercent: percent === null ? null : (percent - 75) / 75 * 100, targetMet: percent === null ? null : percent >= 90 },
  };
}
