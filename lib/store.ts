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
const BUSINESS_TIME_ZONE = "America/Monterrey";
const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    folio TEXT NOT NULL UNIQUE,
    scheduled_at TEXT NOT NULL,
    duration_min INTEGER,
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
      await pgQuery("CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, folio TEXT NOT NULL UNIQUE, scheduled_at TEXT NOT NULL DEFAULT '', duration_min INTEGER, status TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)");
      await pgQuery("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_min INTEGER");
      await pgQuery("UPDATE appointments SET duration_min = (payload::jsonb ->> 'durationMin')::integer WHERE duration_min IS NULL AND payload::jsonb ->> 'durationMin' IS NOT NULL");
      await pgQuery("CREATE EXTENSION IF NOT EXISTS btree_gist");
      await pgQuery("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_scheduled_no_overlap') THEN ALTER TABLE appointments ADD CONSTRAINT appointments_scheduled_no_overlap EXCLUDE USING gist (tstzrange(scheduled_at::timestamptz, scheduled_at::timestamptz + make_interval(mins => duration_min), '[)') WITH &&) WHERE (status IN ('Confirmada', 'En camino', 'En servicio') AND scheduled_at <> '' AND duration_min IS NOT NULL); END IF; END $$");
      const count = await pgQuery<{ count: number }>("SELECT COUNT(*)::int AS count FROM appointments");
      initialized = true;
      if (process.env.NODE_ENV !== "production" && Number(count[0]?.count || 0) === 0) await writeAppointments(await seedFromJson());
    } else {
      await fs.mkdir(path.dirname(SQLITE_FILE), { recursive: true });
      await getSqlite().execute(TABLE_SQL);
      const columns = await getSqlite().execute("PRAGMA table_info(appointments)");
      if (!columns.rows.some((column) => column.name === "duration_min")) await getSqlite().execute("ALTER TABLE appointments ADD COLUMN duration_min INTEGER");
      await getSqlite().execute("UPDATE appointments SET duration_min = CAST(json_extract(payload, '$.durationMin') AS INTEGER) WHERE duration_min IS NULL AND json_extract(payload, '$.durationMin') IS NOT NULL");
      await getSqlite().execute(`CREATE TRIGGER IF NOT EXISTS appointments_scheduled_no_overlap_insert BEFORE INSERT ON appointments WHEN NEW.status IN ('Confirmada', 'En camino', 'En servicio') AND NEW.scheduled_at <> '' AND NEW.duration_min IS NOT NULL AND EXISTS (SELECT 1 FROM appointments other WHERE other.status IN ('Confirmada', 'En camino', 'En servicio') AND other.scheduled_at <> '' AND other.duration_min IS NOT NULL AND julianday(NEW.scheduled_at) < julianday(other.scheduled_at, '+' || other.duration_min || ' minutes') AND julianday(NEW.scheduled_at, '+' || NEW.duration_min || ' minutes') > julianday(other.scheduled_at)) BEGIN SELECT RAISE(ABORT, 'appointment time conflict'); END`);
      await getSqlite().execute(`CREATE TRIGGER IF NOT EXISTS appointments_scheduled_no_overlap_update BEFORE UPDATE ON appointments WHEN NEW.status IN ('Confirmada', 'En camino', 'En servicio') AND NEW.scheduled_at <> '' AND NEW.duration_min IS NOT NULL AND EXISTS (SELECT 1 FROM appointments other WHERE other.id <> NEW.id AND other.status IN ('Confirmada', 'En camino', 'En servicio') AND other.scheduled_at <> '' AND other.duration_min IS NOT NULL AND julianday(NEW.scheduled_at) < julianday(other.scheduled_at, '+' || other.duration_min || ' minutes') AND julianday(NEW.scheduled_at, '+' || NEW.duration_min || ' minutes') > julianday(other.scheduled_at)) BEGIN SELECT RAISE(ABORT, 'appointment time conflict'); END`);
      const count = await getSqlite().execute("SELECT COUNT(*) AS count FROM appointments");
      initialized = true;
      if (process.env.NODE_ENV !== "production" && Number(count.rows[0]?.count || 0) === 0) await writeAppointments(await seedFromJson());
    }
  })();
  await initialization;
}

export async function readAppointments(): Promise<Appointment[]> {
  await ensureDatabase();
  if (DATABASE_URL) {
    const rows = await pgQuery<{ payload: string }>("SELECT payload FROM appointments ORDER BY scheduled_at ASC");
    return rows.map((row) => normalizeAppointment(JSON.parse(String(row.payload)) as Appointment));
  }
  const result = await getSqlite().execute("SELECT payload FROM appointments ORDER BY scheduled_at ASC");
  return result.rows.map((row) => normalizeAppointment(JSON.parse(String(row.payload)) as Appointment));
}

function normalizeAppointment(appointment: Appointment): Appointment {
  return {
    ...appointment,
    scheduledAt: appointment.scheduledAt || null,
    durationMin: appointment.durationMin || null,
    preferredSlots: appointment.preferredSlots || [],
    classification: {
      serviceType: appointment.classification?.serviceType || "Diagnóstico",
      priority: PRIORITIES.includes(appointment.classification?.priority) ? appointment.classification.priority : "Normal",
      source: appointment.classification?.source || "legado",
      ...(appointment.classification?.model ? { model: appointment.classification.model } : {}),
      ...(appointment.classification?.note ? { note: appointment.classification.note } : {}),
    },
  };
}

export async function writeAppointments(appointments: Appointment[]) {
  await ensureDatabase();
  if (DATABASE_URL) {
    for (const appointment of appointments) {
      await pgQuery(
        "INSERT INTO appointments (id, folio, scheduled_at, duration_min, status, created_at, payload) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET folio = EXCLUDED.folio, scheduled_at = EXCLUDED.scheduled_at, duration_min = EXCLUDED.duration_min, status = EXCLUDED.status, payload = EXCLUDED.payload",
        [appointment.id, appointment.folio, appointment.scheduledAt || "", appointment.durationMin, appointment.status, appointment.createdAt, JSON.stringify(appointment)],
      );
    }
    return;
  }
  for (const appointment of appointments) {
    await getSqlite().execute({
      sql: "INSERT INTO appointments (id, folio, scheduled_at, duration_min, status, created_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET folio = excluded.folio, scheduled_at = excluded.scheduled_at, duration_min = excluded.duration_min, status = excluded.status, payload = excluded.payload",
      args: [appointment.id, appointment.folio, appointment.scheduledAt || "", appointment.durationMin, appointment.status, appointment.createdAt, JSON.stringify(appointment)],
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
    if (item.id === ignoreId || !item.scheduledAt || !item.durationMin || !["Confirmada", "En camino", "En servicio"].includes(item.status)) return false;
    const itemStart = new Date(item.scheduledAt).getTime();
    const itemEnd = itemStart + Number(item.durationMin || 60) * 60_000;
    return start < itemEnd && end > itemStart;
  });
}

export function getAvailableSlots(items: Appointment[], dateKey: string, durationMin = 60) {
  const [year, month, dayOfMonth] = dateKey.split("-").map(Number);
  const day = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
  if (!year || !month || !dayOfMonth || day === 0) return [];
  const slots: { value: string; label: string }[] = [];
  for (let minutes = BUSINESS_START * 60; minutes < BUSINESS_END * 60; minutes += SLOT_STEP_MIN) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const candidate = zonedLocalToUtc(year, month, dayOfMonth, hour, minute);
    if (!conflictsWithExisting(items, candidate.toISOString(), durationMin)) {
      if (candidate.getTime() <= Date.now()) continue;
      slots.push({
        value: candidate.toISOString(),
        label: candidate.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE }),
      });
    }
  }
  return slots;
}

export function isWithinBusinessHours(scheduledAt: string, durationMin: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(scheduledAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = Number(values.hour) * 60 + Number(values.minute);
  return values.weekday !== "Sun" && start >= BUSINESS_START * 60 && start + durationMin <= BUSINESS_END * 60;
}

function zonedLocalToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    candidate += target - Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
  }
  return new Date(candidate);
}

export function computeStats(items: Appointment[]): DashboardStats {
  const todayKey = businessDateKey(new Date());
  const active = items.filter((item) => item.status !== "Cancelada");
  const completed = items.filter((item) => item.status === "Completada").length;
  const closed = items.filter((item) => ["Completada", "Cancelada"].includes(item.status)).length;
  return {
    total: items.length,
    today: active.filter((item) => item.scheduledAt && businessDateKey(new Date(item.scheduledAt)) === todayKey).length,
    pendingReview: active.filter((item) => item.status === "Pendiente").length,
    urgent: active.filter((item) => ["Crítica", "Alta"].includes(item.classification?.priority)).length,
    completionRate: closed ? Math.round((completed / closed) * 100) : 0,
    byStatus: Object.fromEntries(STATUSES.map((status) => [status, items.filter((item) => item.status === status).length])) as DashboardStats["byStatus"],
    byPriority: Object.fromEntries(PRIORITIES.map((priority) => [priority, items.filter((item) => item.classification?.priority === priority).length])) as DashboardStats["byPriority"],
  };
}

function businessDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export const businessHours = { start: BUSINESS_START, end: BUSINESS_END, sundayClosed: true };
