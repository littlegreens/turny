import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { AppHeader } from "@/components/app-header";
import { OrgSidebar } from "@/components/org-sidebar";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || null;
  const membership = session?.user?.id
    ? await prisma.orgMember.findFirst({
        where: { userId: session.user.id },
        include: { org: true },
        orderBy: { createdAt: "asc" },
      })
    : null;

  return (
    <div className="d-flex">
      {membership ? <OrgSidebar orgSlug={membership.org.slug} orgName={membership.org.name} /> : null}
      <main className="container-fluid py-4 px-3 px-xl-4" style={{ minHeight: "100vh" }}>
        <AppHeader isAuthenticated={Boolean(session?.user)} displayName={displayName} />
        <section className="mt-3 rounded-4 overflow-hidden border" style={{ background: "linear-gradient(115deg, #14532d 0%, #1f7a3f 58%, #2b9348 100%)" }}>
          <div className="row g-0 align-items-stretch">
            <div className="col-12 col-lg-7">
              <div className="p-4 p-md-5 text-white h-100 d-flex flex-column justify-content-center">
                <p className="mb-2 text-uppercase small fw-semibold" style={{ letterSpacing: "0.08em" }}>
                  Shift with love
                </p>
                <h1 className="display-5 fw-bold mb-3">Pianifica i turni con controllo totale, non con fogli sparsi.</h1>
                <p className="lead mb-4">
                  Turny ti fa vedere subito capacita, disponibilita e carichi: assegni le persone giuste, riduci errori e pubblichi con sicurezza.
                </p>
                <div className="d-flex flex-wrap gap-2">
                  {session?.user ? (
                    <Link href={membership ? `/${membership.org.slug}` : "/dashboard"} className="btn btn-light text-success fw-semibold">
                      Entra nella tua area
                    </Link>
                  ) : (
                    <>
                      <Link href="/login" className="btn btn-light text-success fw-semibold">
                        Accedi ora
                      </Link>
                      <Link href="/register" className="btn btn-outline-light">
                        Crea account
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-5">
              <Image
                src="/home-hero-2.png"
                alt="Calendario su supporto e sfondo neutro"
                width={900}
                height={1200}
                priority
                className="w-100"
                style={{ height: 480, objectFit: "cover" }}
              />
            </div>
          </div>
        </section>

        <section className="row g-3 mt-1">
          <div className="col-12 col-lg-4">
            <article className="card h-100 border-success-subtle">
              <div className="card-body p-4">
                <h2 className="h4 fw-bold mb-2">Visibilita immediata</h2>
                <p className="text-secondary mb-0">
                  Vedi in un colpo solo chi e disponibile, chi e saturo e dove hai buchi di copertura nel mese.
                </p>
              </div>
            </article>
          </div>
          <div className="col-12 col-lg-4">
            <article className="card h-100 border-success-subtle">
              <div className="card-body p-4">
                <h2 className="h4 fw-bold mb-2">Allocazione intelligente</h2>
                <p className="text-secondary mb-0">
                  Assegna turni per competenze e vincoli reali, evitando conflitti e riducendo correzioni dell&apos;ultimo minuto.
                </p>
              </div>
            </article>
          </div>
          <div className="col-12 col-lg-4">
            <article className="card h-100 border-success-subtle">
              <div className="card-body p-4">
                <h2 className="h4 fw-bold mb-2">Decisioni migliori</h2>
                <p className="text-secondary mb-0">
                  Report e indicatori trasformano la pianificazione in decisioni operative chiare per manager e team.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="card mt-3 border-0" style={{ backgroundColor: "#e8f5ec" }}>
          <div className="card-body p-4 p-md-5">
            <div className="row g-4 align-items-center">
              <div className="col-12 col-lg-6">
                <h2 className="h2 fw-bold mb-2">Dal caos operativo a un piano pubblicabile</h2>
                <p className="text-secondary mb-3">
                  Turny nasce per le realta che devono pianificare bene, in fretta, e con meno attriti tra persone, vincoli e disponibilita.
                </p>
                <ul className="list-unstyled mb-0 d-grid gap-2">
                  <li className="d-flex align-items-start gap-2">
                    <span className="badge text-bg-success mt-1">1</span>
                    <span>Configuri calendari, team e regole operative.</span>
                  </li>
                  <li className="d-flex align-items-start gap-2">
                    <span className="badge text-bg-success mt-1">2</span>
                    <span>Inserisci indisponibilita e obiettivi di turno per persona.</span>
                  </li>
                  <li className="d-flex align-items-start gap-2">
                    <span className="badge text-bg-success mt-1">3</span>
                    <span>Generi, validi e pubblichi con report pronti da condividere.</span>
                  </li>
                </ul>
              </div>
              <div className="col-12 col-lg-6">
                <div className="rounded-4 overflow-hidden border bg-white">
                  <Image
                    src="/home-hero.png"
                    alt="Desk con tablet e calendario digitale"
                    width={1280}
                    height={853}
                    className="w-100"
                    style={{ height: 360, objectFit: "cover" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="card mt-3">
          <div className="card-body p-4 p-md-5">
            <div className="row g-3 align-items-center">
              <div className="col-12 col-lg-8">
                <h2 className="h2 fw-bold mb-2">Pronto a pianificare meglio il prossimo mese?</h2>
                <p className="text-secondary mb-0">
                  {session?.user?.email
                    ? `Sei autenticato come ${session.user.email}. Apri l'area operativa e inizia subito.`
                    : "Accedi per aprire dashboard, calendari e configuratore turni."}
                </p>
              </div>
              <div className="col-12 col-lg-4">
                <div className="d-flex gap-2 flex-wrap justify-content-lg-end">
                  {session?.user ? (
                    <Link href={membership ? `/${membership.org.slug}` : "/dashboard"} className="btn btn-success">
                      Vai alla dashboard
                    </Link>
                  ) : (
                    <>
                      <Link href="/login" className="btn btn-success">
                        Login
                      </Link>
                      <Link href="/register" className="btn btn-outline-success">
                        Registrati
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
