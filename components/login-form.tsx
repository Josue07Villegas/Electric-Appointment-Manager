"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirect: false, redirectTo: "/" });
    if (result?.error) { setError("No se pudo iniciar sesión. Verifica tus datos."); setBusy(false); return; }
    window.location.assign("/");
  }
  return <section className="booking-form-panel"><div className="form-heading"><span>PERSONAL / 01</span><h2>Iniciar sesión</h2><p>Usa las credenciales asignadas al personal.</p></div><form onSubmit={submit} className="public-form"><label>Correo electrónico<input name="email" type="email" required autoComplete="username"/></label><label>Contraseña<input name="password" type="password" required autoComplete="current-password"/></label>{error && <p className="form-error">{error}</p>}<button className="public-submit" disabled={busy}>{busy ? "Validando…" : "Entrar al despacho"}</button></form></section>;
}
