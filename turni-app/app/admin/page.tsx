import { prisma } from "@/lib/prisma";
import { AdminOrgCard } from "@/components/admin-org-card";

export default async function SuperAdminPage() {
  const orgs = await prisma.organization.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      slug: true,
      plan: true,
      createdAt: true,
      _count: { select: { members: true, calendars: true } },
    },
  });

  return (
    <div className="d-grid gap-3">
      <section className="card">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div>
              <h1 className="h3 fw-bold mb-1">Super admin</h1>
              <p className="text-secondary mb-0">Gestione multi-societa: entra nel workspace di ogni organizzazione.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">Organizzazioni ({orgs.length})</h2>
          <div className="row g-3">
            {orgs.map((o) => (
              <div key={o.id} className="col-12 col-md-6 col-xl-4">
                <AdminOrgCard
                  org={{
                    id: o.id,
                    slug: o.slug,
                    name: o.name,
                    description: o.description ?? null,
                    plan: String(o.plan),
                    createdAt: o.createdAt.toISOString().slice(0, 10),
                    calendarCount: o._count.calendars,
                    memberCount: o._count.members,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

