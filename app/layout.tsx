import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElectroAgenda",
  description: "Despacho inteligente de servicios eléctricos para un técnico.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
