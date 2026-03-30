import { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppHeader } from "@/components/app-header";
import { authOptions } from "@/lib/auth";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Props = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!isSuperAdminEmail(session.user.email ?? null)) notFound();

  const displayName = session.user.name || session.user.email?.split("@")[0] || null;
  return (
    <div className="d-flex">
      <main className="container-fluid py-4 px-3 px-xl-4" style={{ minHeight: "100vh" }}>
        <AppHeader isAuthenticated displayName={displayName} />
        <div className="pt-3">{children}</div>
      </main>
    </div>
  );
}

