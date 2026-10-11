import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <main className="booking-page"><section className="booking-layout"><div className="booking-manifesto"><p className="micro-label">ELECTROAGENDA / PERSONAL</p><h1>Acceso al despacho.</h1><p className="manifesto-copy">Inicia sesión para revisar solicitudes y administrar la agenda técnica.</p></div><LoginForm/></section></main>;
}
