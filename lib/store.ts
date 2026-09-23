import { promises as fs } from "node:fs";
import path from "node:path";
import type { Appointment, DashboardStats } from "@/lib/types";
import { PRIORITIES, STATUSES } from "@/lib/types";

const DEFAULT_DATA_FILE = path.join(process.cwd(), "data", "appointments.json");
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(/* turbopackIgnore: true */ process.env.DATA_FILE)
  : DEFAULT_DATA_FILE;
const BUSINESS_START = 9;
const BUSINESS_END = 19;
const SLOT_STEP_MIN = 30;
let writeQueue = Promise.resolve();

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

export async function readAppointments(): Promise<Appointment[]> {
  await ensureDataFile();
  const raw = await fs.readFile(/* turbopackIgnore: true */ DATA_FILE, "utf8");
  const value: unknown = JSON.parse(raw || "[]");
  return Array.isArray(value) ? (value as Appointment[]) : [];
}

export async function writeAppointments(appointments: Appointment[]) {
  writeQueue = writeQueue.then(async () => {
    await ensureDataFile();
    const temporary = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(appointments, null, 2)}\n`, "utf8");
    await fs.rename(temporary, DATA_FILE);
  });
  await writeQueue;
}

export function createFolio(appointments: Appointment[]) {
  const largest = appointments.reduce((max, item) => {
    const number = Number(item.folio?.match(/(\d+)$/)?.[1]);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 1000);
  return `ELEC-${largest + 1}`;
}

export function conflictsWithExisting(appointments: Appointment[], scheduledAt: string, durationMin: number, ignoreId?: string) {
  const start = new Date(scheduledAt).getTime();
  const end = start + durationMin * 60_000;
  return appointments.find((item) => {
    if (item.id === ignoreId || item.status === "Cancelada") return false;
    const itemStart = new Date(item.scheduledAt).getTime();
    const itemEnd = itemStart + Number(item.durationMin || 60) * 60_000;
    return start < itemEnd && end > itemStart;
  });
}

export function getAvailableSlots(items: Appointment[], dateKey: string, durationMin = 60) {
  const day = new Date(`${dateKey}T12:00:00`).getDay();
  if (day === 0) return [];
  const slots: { value: string; label: string }[] = [];
  for (let minutes = BUSINESS_START * 60; minutes < BUSINESS_END * 60; minutes += SLOT_STEP_MIN) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const candidate = new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
    const closing = new Date(`${dateKey}T${String(BUSINESS_END).padStart(2, "0")}:00:00`);
    if (candidate.getTime() + durationMin * 60_000 > closing.getTime()) continue;
    if (!conflictsWithExisting(items, candidate.toISOString(), durationMin)) {
      slots.push({
        value: candidate.toISOString(),
        label: candidate.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      });
    }
  }
  return slots;
}

export function computeStats(items: Appointment[]): DashboardStats {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const active = items.filter((item) => item.status !== "Cancelada");
  const completed = items.filter((item) => item.status === "Completada").length;
  const closed = items.filter((item) => ["Completada", "Cancelada"].includes(item.status)).length;
  return {
    total: items.length,
    today: active.filter((item) => item.scheduledAt.slice(0, 10) === todayKey).length,
    pendingReview: active.filter((item) => item.classification?.requiresReview).length,
    urgent: active.filter((item) => ["Crítica", "Alta"].includes(item.classification?.priority)).length,
    completionRate: closed ? Math.round((completed / closed) * 100) : 0,
    byStatus: Object.fromEntries(STATUSES.map((status) => [status, items.filter((item) => item.status === status).length])) as DashboardStats["byStatus"],
    byPriority: Object.fromEntries(PRIORITIES.map((priority) => [priority, items.filter((item) => item.classification?.priority === priority).length])) as DashboardStats["byPriority"],
  };
}

export const businessHours = { start: BUSINESS_START, end: BUSINESS_END, sundayClosed: true };
