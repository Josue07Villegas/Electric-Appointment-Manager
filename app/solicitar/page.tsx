import Link from "next/link";
import { BookingForm } from "@/components/booking-form";

export default function BookingPage() {
  return (
    <main className="booking-page">
      <header className="booking-nav">
        <Link href="/solicitar" className="public-brand"><span className="brand-bolt">ϟ</span><span>Electro<b>Agenda</b></span></Link>
        <span className="nav-note">Canal de servicio · CDMX</span>
      </header>
      <section className="booking-layout">
        <div className="booking-manifesto">
          <p className="micro-label">VISITA TÉCNICA / 01</p>
          <h1>La falla tiene un lugar en la agenda.</h1>
          <p className="manifesto-copy">Cuéntanos qué ocurre. El sistema reserva el horario, identifica el tipo de servicio y señala los casos que el técnico debe revisar primero.</p>
          <div className="circuit-line" aria-hidden="true"><i/><i/><i/><i/></div>
          <dl className="service-facts">
            <div><dt>Horario</dt><dd>Lun–Sáb / 09–19 h</dd></div>
            <div><dt>Capacidad</dt><dd>1 técnico</dd></div>
            <div><dt>Respuesta</dt><dd>Folio inmediato</dd></div>
          </dl>
          <p className="safety-copy"><span>!</span> Humo, chispas u olor a quemado activan revisión humana antes de confirmar.</p>
        </div>
        <BookingForm />
      </section>
    </main>
  );
}
