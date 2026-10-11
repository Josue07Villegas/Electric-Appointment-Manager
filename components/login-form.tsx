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
    try {
      const result = register
        ? await authClient.signUp.email({ ...credentials, name: credentials.email })
        : await authClient.signIn.email(credentials);
      if (result.error) {
        setError(register ? "No se pudo crear la cuenta. Confirma que el correo esté autorizado." : "No se pudo iniciar sesión. Verifica tus datos.");
        return;
      }
      if (register) {
        setMessage("Cuenta creada. Ya puedes entrar al despacho.");
        setRegister(false);
        return;
      }
      window.location.assign("/");
    } catch {
      setError("No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="booking-form-panel staff-login-panel">
      <div className="form-heading">
        <span>PERSONAL / 01</span>
        <h2>{register ? "Crear acceso" : "Iniciar sesión"}</h2>
        <p>{register ? "Solo el correo autorizado puede crear una cuenta." : "Usa las credenciales del personal autorizado."}</p>
      </div>
      <form onSubmit={submit} className="public-form staff-login-form">
        <label className="staff-login-field" htmlFor="staff-email">
          <span>Correo electrónico</span>
          <input id="staff-email" name="email" type="email" placeholder="nombre@empresa.com" required autoComplete="username" />
        </label>
        <label className="staff-login-field" htmlFor="staff-password">
          <span>Contraseña</span>
          <input id="staff-password" name="password" type="password" placeholder="Mínimo 8 caracteres" required minLength={8} autoComplete={register ? "new-password" : "current-password"} />
        </label>
        {error && <p className="form-error staff-login-error" role="alert">{error}</p>}
        {message && <p className="staff-login-message" role="status">{message}</p>}
        <button className="public-submit staff-login-submit" disabled={busy}>
          <span>{busy ? "Procesando…" : register ? "Crear cuenta" : "Entrar al despacho"}</span>
          <span aria-hidden="true">↗</span>
        </button>
        <button type="button" className="staff-register-toggle" onClick={() => { setRegister(!register); setError(""); setMessage(""); }}>
          {register ? "Ya tengo cuenta · Iniciar sesión" : "Configurar acceso autorizado"}
        </button>
        <p className="staff-login-note"><span aria-hidden="true">▣</span> Acceso restringido al personal autorizado</p>
      </form>
    </section>
  );
}
