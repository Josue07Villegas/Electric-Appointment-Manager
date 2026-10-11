import { auth } from "@/lib/auth";

export const proxy = auth.middleware({ loginUrl: "/login" });
export default proxy;

export const config = { matcher: ["/"] };
