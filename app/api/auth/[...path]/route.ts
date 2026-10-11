import { auth } from "@/lib/auth";

const handlers = auth.handler();
type Context = { params: Promise<{ path: string[] }> };

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
export const PATCH = handlers.PATCH;

export async function POST(request: Request, context: Context) {
  const { path } = await context.params;
  if (path.join("/") === "sign-up/email") {
    let email = "";
    try {
      const payload = await request.clone().json() as { email?: unknown };
      if (typeof payload.email === "string") email = payload.email.trim().toLowerCase();
    } catch {
      return Response.json({ message: "Solicitud de registro inválida" }, { status: 400 });
    }
    const allowed = (process.env.STAFF_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!email || !allowed.includes(email)) {
      return Response.json({ message: "Correo no autorizado para el despacho" }, { status: 403 });
    }
  }
  return handlers.POST(request, context);
}
