import { DispatchApp } from "@/components/dispatch-app";
import { isAuthorizedStaff } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isAuthorizedStaff())) redirect("/login");
  return <DispatchApp />;
}
