"use client";

import { FormEvent, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import type { Appointment } from "@/lib/types";

type Slot = { value: string; label: string };

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function durationFor(service: string) {
  if (service === "Cotización") return 30;
  if (["Instalación", "Reparación"].includes(service)) return 90;
  return 60;
}

export function BookingForm() {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const [date, setDate] = useState(dateKey(tomorrow));
  const [service, setService] = useState("Diagnóstico eléctrico");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [busy, setBusy] = useState(false);
  const [risk, setRisk] = useState(false);
  const [result, setResult] = useState<Appointment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true); setSelectedSlot("");
    fetch(`/api/availability?date=${date}&duration=${durationFor(service)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (!cancelled) setSlots(payload.slots || []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [date, service]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot) { setError("Selecciona un horario disponible."); return; }
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries()) as Record<string, unknown>;
    payload.scheduledAt = selectedSlot;
    payload.durationMin = durationFor(service);
    payload.riskSignals = { sparks: data.has("sparks"), smoke: data.has("smoke"), burningSmell: data.has("burningSmell"), totalPowerLoss: data.has("totalPowerLoss") };
    try {
      const response = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible registrar la solicitud");
      setResult(body.appointment);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible registrar la solicitud"); }
    finally { setBusy(false); }
  }

  if (result) return <section className="booking-form-panel booking-success">
    <span className="success-seal"><Icon name="check" size={30}/></span><p className="micro-label">SOLICITUD RECIBIDA</p><h2>{result.status === "Pendiente" ? "El técnico revisará tu caso." : "La visita quedó registrada."}</h2><p>Conserva el folio para identificar el servicio.</p><strong className="folio-display">{result.folio}</strong><dl><div><dt>Fecha</dt><dd>{new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(result.scheduledAt))}</dd></div><div><dt>Lectura inicial</dt><dd>{result.classification.serviceType} / {result.classification.priority}</dd></div><div><dt>Estado</dt><dd>{result.status}</dd></div></dl><button onClick={() => window.location.reload()}>Crear otra solicitud</button>
  </section>;

  return <section className="booking-form-panel">
    <div className="form-heading"><span>FORM / 01</span><h2>Solicitud de visita</h2><p>Los campos marcados son necesarios para reservar.</p></div>
    <form onSubmit={submit} className="public-form">
      <div className="form-chapter"><b>01</b><span>Contacto</span></div>
      <div className="public-fields"><label>Nombre completo *<input name="clientName" required autoComplete="name"/></label><label>Teléfono con lada *<input name="phone" required autoComplete="tel"/></label><label>Correo electrónico<input name="email" type="email" autoComplete="email"/></label><label>Tipo de inmueble *<select name="propertyType" required defaultValue=""><option value="" disabled>Seleccionar</option><option>Casa</option><option>Departamento</option><option>Comercio</option><option>Oficina</option><option>Otro</option></select></label><label className="full">Dirección o zona *<input name="address" required placeholder="Calle, colonia y referencia"/></label></div>

      <div className="form-chapter"><b>02</b><span>Lectura de la falla</span></div>
      <div className="public-fields"><label>Servicio aproximado<select name="requestedService" value={service} onChange={(event) => setService(event.target.value)}><option>Diagnóstico eléctrico</option><option>Instalación</option><option>Mantenimiento</option><option>Reparación</option><option>Cotización</option></select></label><label className="full">¿Qué ocurre? *<textarea name="description" required rows={4} placeholder="Describe lo que observas y desde cuándo"/></label></div>
      <fieldset className="signal-checks" onChange={(event) => { const fieldset = event.currentTarget; setRisk(Boolean(fieldset.querySelector<HTMLInputElement>('input[name="sparks"]:checked, input[name="smoke"]:checked, input[name="burningSmell"]:checked'))); }}><legend>SEÑALES OBSERVADAS</legend><label><input type="checkbox" name="sparks"/> Chispas</label><label><input type="checkbox" name="smoke"/> Humo</label><label><input type="checkbox" name="burningSmell"/> Olor a quemado</label><label><input type="checkbox" name="totalPowerLoss"/> Sin energía</label></fieldset>
      {risk && <p className="risk-strip"><b>Revisión prioritaria.</b> El técnico deberá validar la solicitud antes de confirmarla.</p>}

      <div className="form-chapter"><b>03</b><span>Ventana de atención</span></div>
      <div className="date-field"><label>Fecha *<input type="date" min={dateKey()} value={date} onChange={(event) => setDate(event.target.value)} required/></label><div><span>HORAS DISPONIBLES</span><div className="public-slots">{loadingSlots ? <p>Consultando línea…</p> : slots.length ? slots.map((slot) => <button type="button" key={slot.value} className={selectedSlot === slot.value ? "selected" : ""} onClick={() => { setSelectedSlot(slot.value); setError(""); }}>{slot.label}</button>) : <p>No hay espacios en esta fecha.</p>}</div></div></div>
      <label className="consent-line"><input type="checkbox" required/> Acepto el uso de mis datos para gestionar esta visita.</label>
      {error && <p className="form-error">{error}</p>}
      <button className="public-submit" disabled={busy}>{busy ? "Clasificando solicitud…" : "Generar orden de servicio"}<Icon name="arrow"/></button>
    </form>
  </section>;
}
