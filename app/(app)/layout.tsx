import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUser, toPublicUser } from "@/lib/repositories/users";
import AppChrome from "@/components/AppChrome";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const userDoc = await getUser(session.sub);
  if (!userDoc) redirect("/login");
  if (!userDoc.displayNameSet) redirect("/welcome");

  return <AppChrome user={toPublicUser(userDoc)}>{children}</AppChrome>;
}
