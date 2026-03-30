import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AdminPlanSelect } from "@/components/admin-plan-select";

export default async function SuperAdminPage() {
  const [orgs, users] = await Promise.all([
    prisma.organization.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
        _count: { select: { members: true, calendars: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        _count: { select: { orgMemberships: true, calendarMemberships: true } },
      },
      take: 200,
    }),
  ]);

  return (
    <div className="d-grid gap-3">
      <section className="card">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div>
              <h1 className="h3 fw-bold mb-1">Super admin</h1>
              <p className="text-secondary mb-0">Vista completa di organizzazioni e utenti registrati.</p>
            </div>
            <Link href="/" className="btn btn-outline-success">
              Torna alla home
            </Link>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">Organizzazioni ({orgs.length})</h2>
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Slug</th>
                  <th className="text-end">Calendari</th>
                  <th className="text-end">Membri</th>
                  <th>Piano</th>
                  <th className="text-nowrap">Creata</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td className="fw-semibold">{o.name}</td>
                    <td className="text-secondary">{o.slug}</td>
                    <td className="text-end">{o._count.calendars}</td>
                    <td className="text-end">{o._count.members}</td>
                    <td>
                      <AdminPlanSelect orgId={o.id} initialPlan={String(o.plan)} />
                    </td>
                    <td className="text-nowrap small text-secondary">{o.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">Utenti (ultimi {users.length})</h2>
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nome</th>
                  <th className="text-end">Org</th>
                  <th className="text-end">Calendari</th>
                  <th className="text-nowrap">Creato</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="fw-semibold">{u.email}</td>
                    <td className="text-secondary">
                      {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "—"}
                    </td>
                    <td className="text-end">{u._count.orgMemberships}</td>
                    <td className="text-end">{u._count.calendarMemberships}</td>
                    <td className="text-nowrap small text-secondary">{u.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small text-secondary mb-0 mt-2">
            Nota: per performance mostro gli ultimi 200 utenti. Se vuoi ricerca/filtri, li aggiungiamo.
          </p>
        </div>
      </section>
    </div>
  );
}

