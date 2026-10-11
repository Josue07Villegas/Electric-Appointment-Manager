import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const proxy = auth((request) => {
  if (!request.auth) return NextResponse.redirect(new URL("/login", request.nextUrl));
});

export const config = { matcher: ["/"] };
