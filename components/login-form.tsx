"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const credentials = { email: String(form.get("email")), password: String(form.get("password")) };
    const result = register
      ? await authClient.signUp.email({ ...credentials, name: credentials.email })
      : await authClient.signIn.email(credentials);
    if (result.error) {
      setError(register ? "No se pudo crear la cuenta. Confirma que el correo esté autorizado." : "No se pudo iniciar sesión. Verifica tus datos.");
      setBusy(false);
      return;
    }
    if (register) {
      setMessage("Cuenta creada. Ya puedes entrar al despacho.");
      setRegister(false);
      setBusy(false);
      return;
    }
    window.location.assign("/");
  }
  return <section className="booking-form-panel"><div className="form-heading"><span>PERSONAL / 01</span><h2>{register ? "Crear acceso" : "Iniciar sesión"}</h2><p>{register ? "Solo el correo autorizado puede crear una cuenta." : "Usa las credenciales del personal autorizado."}</p></div><form onSubmit={submit} className="public-form"><label>Correo electrónico<input name="email" type="email" required autoComplete="username"/></label><label>Contraseña<input name="password" type="password" required minLength={8} autoComplete={register ? "new-password" : "current-password"}/></label>{error && <p className="form-error">{error}</p>}{message && <p>{message}</p>}<button className="public-submit" disabled={busy}>{busy ? "Procesando…" : register ? "Crear cuenta" : "Entrar al despacho"}</button><button type="button" className="portal-link" onClick={() => { setRegister(!register); setError(""); setMessage(""); }}>{register ? "Ya tengo cuenta" : "Configurar acceso autorizado"}</button></form></section>;
}
