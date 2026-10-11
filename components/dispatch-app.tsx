"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { authClient } from "@/lib/auth-client";
import type { Appointment, AppointmentStatus, DashboardStats, Priority } from "@/lib/types";
import { PRIORITIES, STATUSES } from "@/lib/types";

type View = "despacho" | "ordenes" | "sistema";
type Config = { jevEnabled: boolean; model: string; technicianCount: number; businessHours: { start: number; end: number; sundayClosed: boolean }; timezone: string };

const fmtDay = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Monterrey" });
const fmtLong = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Monterrey" });
const fmtTime = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Monterrey" });

function slug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-");
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) }, cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No fue posible completar la operación");
  return payload as T;
}

function PriorityMark({ value }: { value: Priority }) {
  return <span className={`priority-mark ${slug(value)}`}><i/>{value}</span>;
}

function StatusMark({ value }: { value: AppointmentStatus }) {
  return <span className={`status-mark ${slug(value)}`}>{value}</span>;
}

export function DispatchApp() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [view, setView] = useState<View>("despacho");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [orders, nextStats, nextConfig] = await Promise.all([
      api<{ appointments: Appointment[] }>("/api/appointments"),
      api<DashboardStats>("/api/stats"),
      api<Config>("/api/config"),
    ]);
    setAppointments(orders.appointments);
    setStats(nextStats);
    setConfig(nextConfig);
  }, []);

  useEffect(() => { load().catch((error) => setToast(error.message)); }, [load]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 3500); return () => clearTimeout(id); }, [toast]);

  const upcoming = useMemo(() => appointments
    .filter((item) => Boolean(item.scheduledAt) && !["Cancelada", "Completada"].includes(item.status) && new Date(item.scheduledAt || 0).getTime() >= Date.now() - 3_600_000)
    .sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime()), [appointments]);
  const active = upcoming[0];
  const priorityRank: Record<Priority, number> = { "Crítica": 0, "Alta": 1, "Normal": 2, "Baja": 3 };
  const reviewQueue = appointments.filter((item) => item.status === "Pendiente").sort((a, b) => priorityRank[a.classification.priority] - priorityRank[b.classification.priority] || a.createdAt.localeCompare(b.createdAt));
  const filtered = appointments.filter((item) => {
    const text = `${item.folio} ${item.clientName} ${item.address} ${item.description}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!statusFilter || item.status === statusFilter) && (!priorityFilter || item.classification.priority === priorityFilter);
  }).sort((a, b) => a.status === "Pendiente" && b.status === "Pendiente" ? priorityRank[a.classification.priority] - priorityRank[b.classification.priority] || a.createdAt.localeCompare(b.createdAt) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  async function patchStatus(id: string, status: AppointmentStatus, scheduledAt?: string, durationMin?: number) {
    setBusy(true);
    try {
      const result = await api<{ appointment: Appointment }>(`/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status, ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}), ...(durationMin ? { durationMin } : {}) }) });
      setToast(`Orden ${result.appointment.folio}: ${status.toLowerCase()}.`);
      setSelected(result.appointment);
      await load();
    } catch (error) { setToast(error instanceof Error ? error.message : "No fue posible actualizar"); }
    finally { setBusy(false); }
  }

  async function reclassify(id: string) {
    setBusy(true);
    try {
      const result = await api<{ appointment: Appointment }>(`/api/appointments/${id}/reclassify`, { method: "POST", body: "{}" });
      setSelected(result.appointment);
      setToast("La clasificación se actualizó.");
      await load();
    } catch (error) { setToast(error instanceof Error ? error.message : "No fue posible clasificar"); }
    finally { setBusy(false); }
  }

  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries()) as Record<string, unknown>;
    payload.riskSignals = {
      sparks: form.has("sparks"), smoke: form.has("smoke"), burningSmell: form.has("burningSmell"), totalPowerLoss: form.has("totalPowerLoss"),
    };
    payload.scheduledAt = new Date(String(payload.scheduledAt)).toISOString();
    payload.durationMin = Number(payload.durationMin);
    try {
      const result = await api<{ appointment: Appointment }>("/api/appointments", { method: "POST", body: JSON.stringify(payload) });
      setShowNew(false);
      setSelected(result.appointment);
      setToast(`${result.appointment.folio} ingresó al despacho.`);
      await load();
    } catch (error) { setToast(error instanceof Error ? error.message : "No fue posible crear la orden"); }
    finally { setBusy(false); }
  }

  return (
    <main className="control-room">
      <aside className="control-rail">
        <button className="rail-logo" onClick={() => setView("despacho")} aria-label="Inicio"><span>ϟ</span><small>EA</small></button>
        <nav>
          <button className={view === "despacho" ? "active" : ""} onClick={() => setView("despacho")}><Icon name="grid"/><span>Despacho</span></button>
          <button className={view === "ordenes" ? "active" : ""} onClick={() => setView("ordenes")}><Icon name="list"/><span>Órdenes</span></button>
          <button className={view === "sistema" ? "active" : ""} onClick={() => setView("sistema")}><Icon name="settings"/><span>Sistema</span></button>
        </nav>
        <div className="rail-foot"><span>01</span><small>TÉCNICO</small></div>
      </aside>

      <section className="workbench">
        <header className="workbench-header">
            <div><p className="micro-label">ELECTROAGENDA / CENTRO DE CONTROL</p><h1>{view === "despacho" ? "Despacho" : view === "ordenes" ? "Órdenes de servicio" : "Sistema"}<sup>01</sup></h1></div>
          <div className="header-actions"><span className="live-signal"><i/> EN LÍNEA</span><Link href="/solicitar" className="portal-link">Portal cliente <Icon name="arrow" size={16}/></Link><button className="new-order" onClick={() => setShowNew(true)}><Icon name="plus"/> Nueva orden</button><button className="session-exit" onClick={async () => { await authClient.signOut(); window.location.assign("/login"); }}>Cerrar sesión</button></div>
        </header>

        {view === "despacho" && <>
          <section className="telemetry" aria-label="Indicadores">
            <div><span>HOY</span><strong>{stats?.today ?? "—"}</strong><small>visitas</small></div>
            <div><span>POR ASIGNAR</span><strong>{stats?.pendingReview ?? "—"}</strong><small>solicitudes</small></div>
            <div><span>ALTA TENSIÓN</span><strong>{stats?.urgent ?? "—"}</strong><small>prioridad</small></div>
            <div><span>CIERRE</span><strong>{stats?.completionRate ?? "—"}<em>%</em></strong><small>completado</small></div>
            <div className="telemetry-engine"><span>MOTOR</span><strong className={config?.jevEnabled ? "engine-live" : ""}>{config?.jevEnabled ? "JEV" : "LOCAL"}</strong><small>{config?.jevEnabled ? config.model : "respaldo activo"}</small></div>
          </section>

          <div className="dispatch-layout">
            <section className="route-board">
              <header><div><p className="micro-label">SECUENCIA OPERATIVA</p><h2>Próximas conexiones</h2></div><span>{fmtLong.format(new Date())}</span></header>
              <div className="route-axis">
                {upcoming.slice(0, 5).map((item, index) => <button key={item.id} className={`route-stop ${index === 0 ? "current" : ""}`} onClick={() => setSelected(item)}>
                  <time>{fmtTime.format(new Date(item.scheduledAt || ""))}</time><i/><div><strong>{item.clientName}</strong><span>{item.classification.serviceType} / {item.address}</span></div><PriorityMark value={item.classification.priority}/>
                </button>)}
                {!upcoming.length && <p className="no-signal">Sin servicios próximos. La línea está disponible.</p>}
              </div>
            </section>

            <section className="live-order">
              <div className="order-grid-mark" aria-hidden="true"/>
              <header><span>ORDEN ACTIVA</span><b>{active?.folio || "SIN ORDEN"}</b></header>
              {active ? <>
                <div className="live-priority"><PriorityMark value={active.classification.priority}/><span>{active.status}</span></div>
                <h2>{active.clientName}</h2>
                <p className="live-description">{active.description}</p>
                <dl className="live-facts">
                  <div><dt><Icon name="clock" size={17}/> Ventana</dt><dd>{active.scheduledAt ? <>{fmtDay.format(new Date(active.scheduledAt))}<br/>{fmtTime.format(new Date(active.scheduledAt))} · {active.durationMin} min</> : "Pendiente de asignar"}</dd></div>
                  <div><dt><Icon name="pin" size={17}/> Ubicación</dt><dd>{active.address}</dd></div>
                  <div><dt><Icon name="spark" size={17}/> Servicio</dt><dd>{active.classification.serviceType}</dd></div>
                </dl>
                <div className="live-actions"><button onClick={() => patchStatus(active.id, "En camino")} disabled={busy}>Iniciar ruta <Icon name="arrow" size={18}/></button><button onClick={() => setSelected(active)}>Abrir orden</button></div>
              </> : <p className="no-live-order">La agenda no tiene una orden activa.</p>}
            </section>
          </div>

          <section className="triage-board">
              <header><div><p className="micro-label">BANDEJA DE ENTRADA</p><h2>Solicitudes pendientes</h2></div><button onClick={() => setView("ordenes")}>Ver archivo completo <Icon name="arrow" size={16}/></button></header>
            <div className="triage-lines">
              {reviewQueue.map((item, index) => <button key={item.id} onClick={() => setSelected(item)}>
                <span className="line-index">{String(index + 1).padStart(2, "0")}</span><div className="line-main"><strong>{item.clientName}</strong><p>{item.description}</p></div><span className="line-type">{item.classification.serviceType}</span><PriorityMark value={item.classification.priority}/><Icon name="arrow"/>
              </button>)}
              {!reviewQueue.length && <p className="no-signal">Sin solicitudes pendientes.</p>}
            </div>
          </section>
        </>}

        {view === "ordenes" && <section className="orders-archive">
          <div className="archive-toolbar">
            <label className="search-box"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cliente, folio o falla"/></label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Cualquier estado</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">Cualquier prioridad</option>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select>
          </div>
          <div className="archive-head"><span>ORDEN / SERVICIO</span><span>CLIENTE</span><span>VENTANA</span><span>LECTURA</span><span>ESTADO</span><span/></div>
          <div className="archive-list">
            {filtered.map((item) => <button key={item.id} onClick={() => setSelected(item)}>
              <span><b>{item.folio}</b><small>{item.classification.serviceType}</small></span><span><b>{item.clientName}</b><small>{item.address}</small></span><span><b>{item.scheduledAt ? fmtDay.format(new Date(item.scheduledAt)) : "Por asignar"}</b><small>{item.scheduledAt ? `${fmtTime.format(new Date(item.scheduledAt))} · ${item.durationMin ?? "—"} min` : `${item.preferredSlots.length} preferencias`}</small></span><span><PriorityMark value={item.classification.priority}/><small>{item.classification.serviceType}</small></span><StatusMark value={item.status}/><Icon name="arrow"/>
            </button>)}
          </div>
        </section>}

        {view === "sistema" && <section className="system-view">
          <div className="system-statement"><p className="micro-label">ARQUITECTURA / MVP</p><h2>Una agenda central para solicitudes y visitas técnicas.</h2><p>JEV aporta el tipo de servicio y la prioridad. El personal determina la duración y asigna la visita a la agenda del técnico principal.</p></div>
          <div className="system-ledger">
            <div><span>CAPACIDAD ACTUAL</span><strong>01</strong><p>técnico principal</p></div>
            <div><span>CLASIFICADOR</span><strong>{config?.jevEnabled ? "JEV" : "LOCAL"}</strong><p>{config?.jevEnabled ? config.model : "listo para conectar"}</p></div>
            <div><span>ALMACENAMIENTO</span><strong>{config?.businessHours ? "SQL" : "LOCAL"}</strong><p>{config?.businessHours ? "SQLite / Neon Postgres" : "base de datos"}</p></div>
          </div>
          <ol className="scale-wire">
            <li><b>01</b><div><strong>Agenda individual</strong><p>Bloqueo de horarios, folios y estados para una persona.</p></div></li>
            <li><b>02</b><div><strong>Cuadrilla</strong><p>Calendario y especialidades por técnico.</p></div></li>
            <li><b>03</b><div><strong>Despacho por zona</strong><p>Asignación por cercanía, prioridad y carga de trabajo.</p></div></li>
          </ol>
          <div className="api-note"><span className={config?.jevEnabled ? "on" : ""}/><div><strong>{config?.jevEnabled ? "JEV conectado" : "Clasificador local activo"}</strong><p>JEV determina el tipo de servicio y la prioridad. La clave vive únicamente en el servidor.</p></div></div>
        </section>}
      </section>

      {selected && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="order-drawer">
        <button className="drawer-close" onClick={() => setSelected(null)}><Icon name="close"/></button>
        <p className="micro-label">EXPEDIENTE / {selected.folio}</p><h2>{selected.clientName}</h2><div className="drawer-marks"><PriorityMark value={selected.classification.priority}/><StatusMark value={selected.status}/></div>
        <section><h3>Reporte</h3><p>{selected.description}</p></section>
        <section className="drawer-grid"><div><span>HORARIO ASIGNADO</span><strong>{selected.scheduledAt ? <>{fmtLong.format(new Date(selected.scheduledAt))}<br/>{fmtTime.format(new Date(selected.scheduledAt))}</> : "Pendiente"}</strong></div><div><span>DURACIÓN</span><strong>{selected.durationMin ? `${selected.durationMin} min` : "Por definir"}</strong></div><div><span>TIPO DE SERVICIO</span><strong>{selected.classification.serviceType}</strong></div><div><span>ORIGEN DE CLASIFICACIÓN</span><strong>{selected.classification.source}</strong></div><div className="wide"><span>PREFERENCIAS DEL CLIENTE</span><strong>{selected.preferredSlots.map((slot) => `${fmtDay.format(new Date(slot))} ${fmtTime.format(new Date(slot))}`).join(" · ") || "Sin preferencias"}</strong></div></section>
        <section><h3>Contacto y ubicación</h3><p>{selected.phone}<br/>{selected.email || "Sin correo"}<br/>{selected.address}</p></section>
        <div className="drawer-controls"><label>Fecha y hora asignadas<input type="datetime-local" id="drawer-scheduled" defaultValue={selected.scheduledAt?.slice(0, 16) || ""}/></label><label>Duración estimada<select id="drawer-duration" defaultValue={selected.durationMin || "60"}><option value="30">30 minutos</option><option value="60">60 minutos</option><option value="90">90 minutos</option><option value="120">120 minutos</option></select></label><select defaultValue={selected.status} id="drawer-status">{STATUSES.map((status) => <option key={status}>{status}</option>)}</select><button disabled={busy} onClick={() => { const scheduled = (document.querySelector("#drawer-scheduled") as HTMLInputElement).value; const requestedStatus = (document.querySelector("#drawer-status") as HTMLSelectElement).value as AppointmentStatus; const duration = Number((document.querySelector("#drawer-duration") as HTMLSelectElement).value); patchStatus(selected.id, scheduled && requestedStatus === "Pendiente" ? "Confirmada" : requestedStatus, scheduled || undefined, duration); }}>{selected.status === "Pendiente" ? "Asignar y confirmar" : "Guardar cambios"}</button><button className="secondary" disabled={busy} onClick={() => reclassify(selected.id)}>Reclasificar</button></div>
      </aside></div>}

      {showNew && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setShowNew(false)}><aside className="order-drawer new-drawer"><button className="drawer-close" onClick={() => setShowNew(false)}><Icon name="close"/></button><p className="micro-label">INGRESO MANUAL</p><h2>Nueva orden</h2><OrderForm busy={busy} onSubmit={createAppointment}/></aside></div>}
      {toast && <div className="control-toast">{toast}</div>}
    </main>
  );
}

function OrderForm({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const tomorrow = new Date(Date.now() + 86_400_000); tomorrow.setHours(9, 0, 0, 0);
  const defaultDate = `${dateKey(tomorrow)}T09:00`;
  return <form className="order-form" onSubmit={onSubmit}>
    <label>Cliente<input name="clientName" required/></label><label>Teléfono<input name="phone" required/></label><label>Correo<input name="email" type="email"/></label><label>Inmueble<select name="propertyType"><option>Casa</option><option>Departamento</option><option>Comercio</option><option>Oficina</option><option>Otro</option></select></label><label className="wide">Dirección<input name="address" required/></label><label>Servicio<select name="requestedService"><option>Diagnóstico eléctrico</option><option>Instalación</option><option>Mantenimiento</option><option>Reparación</option><option>Cotización</option></select></label><label>Fecha y hora<input type="datetime-local" name="scheduledAt" defaultValue={defaultDate} required/></label><label>Duración estimada<select name="durationMin"><option value="30">30 minutos</option><option value="60">60 minutos</option><option value="90">90 minutos</option><option value="120">120 minutos</option></select></label><label className="wide">Descripción<textarea name="description" rows={4} required/></label>
    <fieldset><legend>Señales</legend><label><input type="checkbox" name="sparks"/> Chispas</label><label><input type="checkbox" name="smoke"/> Humo</label><label><input type="checkbox" name="burningSmell"/> Olor a quemado</label><label><input type="checkbox" name="totalPowerLoss"/> Sin energía</label></fieldset>
    <button className="submit-order" disabled={busy}>{busy ? "Clasificando…" : "Clasificar e ingresar"}<Icon name="arrow"/></button>
  </form>;
}
