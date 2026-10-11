import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { timingSafeEqual } from "node:crypto";

function matches(value: unknown, expected: string | undefined) {
  if (typeof value !== "string" || !expected) return false;
  const actualBytes = Buffer.from(value);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Credentials({
    credentials: {
      email: { label: "Correo del personal", type: "email" },
      password: { label: "Contraseña", type: "password" },
    },
    async authorize(credentials) {
      if (!matches(credentials.email, process.env.STAFF_EMAIL) || !matches(credentials.password, process.env.STAFF_PASSWORD)) return null;
      return { id: "staff", name: "Personal autorizado", email: process.env.STAFF_EMAIL };
    },
  })],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
});
