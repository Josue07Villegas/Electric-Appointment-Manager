import { createClient, type Client } from "@libsql/client";
import { neon } from "@neondatabase/serverless";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Appointment, DashboardStats } from "@/lib/types";
import { PRIORITIES, STATUSES } from "@/lib/types";

const DEFAULT_DATA_FILE = path.join(process.cwd(), "data", "appointments.json");
const DEFAULT_SQLITE_FILE = path.join(process.cwd(), "data", "electroagenda.db");
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : DEFAULT_DATA_FILE;
const SQLITE_FILE = process.env.SQLITE_DB_PATH ? path.resolve(process.env.SQLITE_DB_PATH) : DEFAULT_SQLITE_FILE;
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
const BUSINESS_START = 9;
const BUSINESS_END = 19;
const SLOT_STEP_MIN = 30;
const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    folio TEXT NOT NULL UNIQUE,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )
`;

let sqlite: Client | null = null;
let postgres: ReturnType<typeof neon> | null = null;
let initialized = false;
let initialization: Promise<void> | null = null;

function getSqlite() {
  if (!sqlite) sqlite = createClient({ url: `file:${SQLITE_FILE}` });
  return sqlite;
}

function getPostgres() {
  if (!postgres) postgres = neon(DATABASE_URL as string);
  return postgres;
}

async function pgQuery<T extends Record<string, unknown> = Record<string, unknown>>(query: string, values: unknown[] = []) {
  return getPostgres().query(query, values) as Promise<T[]>;
}

async function seedFromJson() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const value: unknown = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value as Appointment[] : [];
  } catch {
    return [];
  }
}

async function ensureDatabase() {
  if (initialized) return;
  if (initialization) return initialization;
  initialization = (async () => {
    if (DATABASE_URL) {
      await pgQuery("CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, folio TEXT NOT NULL UNIQUE, scheduled_at TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)");
      const count = await pgQuery<{ count: number }>("SELECT COUNT(*)::int AS count FROM appointments");
      initialized = true;
      if (Number(count[0]?.count || 0) === 0) await writeAppointments(await seedFromJson());
    } else {
      await fs.mkdir(path.dirname(SQLITE_FILE), { recursive: true });
      await getSqlite().execute(TABLE_SQL);
      const count = await getSqlite().execute("SELECT COUNT(*) AS count FROM appointments");
      initialized = true;
      if (Number(count.rows[0]?.count || 0) === 0) await writeAppointments(await seedFromJson());
    }
  })();
  await initialization;
}

export async function readAppointments(): Promise<Appointment[]> {
  await ensureDatabase();
  if (DATABASE_URL) {
    const rows = await pgQuery<{ payload: string }>("SELECT payload FROM appointments ORDER BY scheduled_at ASC");
    return rows.map((row) => JSON.parse(String(row.payload)) as Appointment);
  }
  const result = await getSqlite().execute("SELECT payload FROM appointments ORDER BY scheduled_at ASC");
  return result.rows.map((row) => JSON.parse(String(row.payload)) as Appointment);
}

export async function writeAppointments(appointments: Appointment[]) {
  await ensureDatabase();
  if (DATABASE_URL) {
    for (const appointment of appointments) {
      await pgQuery(
        "INSERT INTO appointments (id, folio, scheduled_at, status, created_at, payload) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET folio = EXCLUDED.folio, scheduled_at = EXCLUDED.scheduled_at, status = EXCLUDED.status, payload = EXCLUDED.payload",
        [appointment.id, appointment.folio, appointment.scheduledAt, appointment.status, appointment.createdAt, JSON.stringify(appointment)],
      );
    }
    return;
  }
  for (const appointment of appointments) {
    await getSqlite().execute({
      sql: "INSERT INTO appointments (id, folio, scheduled_at, status, created_at, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET folio = excluded.folio, scheduled_at = excluded.scheduled_at, status = excluded.status, payload = excluded.payload",
      args: [appointment.id, appointment.folio, appointment.scheduledAt, appointment.status, appointment.createdAt, JSON.stringify(appointment)],
    });
  }
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
