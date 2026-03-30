import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { ContactLeadForm } from "@/components/contact-lead-form";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const membership = session?.user?.id
    ? await prisma.orgMember.findFirst({
        where: { userId: session.user.id },
        include: { org: true },
        orderBy: { createdAt: "asc" },
      })
    : null;

  const ctaHref = session?.user ? (membership ? `/${membership.org.slug}` : "/dashboard") : "/login";
  const ctaLabel = session?.user ? "Entra" : "Login";

  return (
    <div className="d-flex">
      <main className="container-fluid p-0" style={{ minHeight: "100vh" }}>

        {/* Header fisso trasparente */}
        <header
          className="home-topbar position-fixed top-0 start-0"
          style={{ zIndex: 30, background: "transparent", width: "100%" }}
        >
          <div className="d-flex justify-content-between align-items-center px-3 px-sm-4 py-3">
            <Link href="/" className="d-inline-flex align-items-center" aria-label="Vai alla home Turny">
              <Image
                src="/turny_logo.svg"
                alt="Turny"
                width={150}
                height={44}
                priority
                style={{ filter: "brightness(0) invert(1)", width: "clamp(110px, 22vw, 180px)", height: "auto" }}
              />
            </Link>
            <div className="d-flex align-items-center gap-2">
              {session?.user ? (
                <Link href={ctaHref} className="btn btn-success btn-sm fw-semibold px-3">
                  Entra
                </Link>
              ) : (
                <>
                  <Link href="/register" className="btn btn-outline-light btn-sm px-3">
                    Registrati
                  </Link>
                  <Link href="/login" className="btn btn-light btn-sm text-success fw-semibold px-3">
                    Login
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        {/* 1) Hero fullscreen con video */}
        <section
          className="position-relative overflow-hidden"
          style={{
            minHeight: "100svh",
            background: "linear-gradient(115deg, #0b2a18 0%, #14532d 55%, #1f7a3f 100%)",
          }}
        >
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="position-absolute top-0 start-0 w-100 h-100"
            style={{ objectFit: "cover" }}
          >
            <source src="/home_video.mp4" type="video/mp4" />
          </video>

          <div className="position-relative d-flex align-items-center" style={{ zIndex: 2, minHeight: "100svh" }}>
            <div className="w-100 px-3 px-sm-4 px-xl-5" style={{ paddingTop: "100px", paddingBottom: "60px" }}>
              <div style={{ maxWidth: 680 }}>
                <h1
                  className="fw-bold text-white mb-3"
                  style={{ fontSize: "clamp(1.8rem, 5vw, 3.2rem)", lineHeight: 1.15 }}
                >
                  Turni chiari. Vincoli sotto controllo. Team più sereno.
                </h1>
                <p
                  className="mb-4"
                  style={{ color: "rgba(255,255,255,0.86)", fontSize: "clamp(1rem, 2vw, 1.25rem)" }}
                >
                  Imposti regole e disponibilità, visualizzi conflitti in tempo reale e generi un piano pubblicabile in pochi click.
                </p>
                <div className="d-flex flex-wrap gap-2">
                  <Link href={ctaHref} className="btn btn-success btn-lg px-4 fw-semibold">
                    {ctaLabel}
                  </Link>
                  <a href="#contatti" className="btn btn-outline-light btn-lg px-4">
                    Scopri come
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2) Schermata con bg_3 + CTA + form */}
        <section
          id="contatti"
          style={{
            minHeight: "100svh",
            backgroundImage: "url(/bg_3.jpeg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          className="d-flex align-items-center position-relative"
        >
          <div className="w-100 px-3 px-sm-4 px-xl-5" style={{ paddingTop: "80px", paddingBottom: "60px", maxWidth: 1240 }}>
            <div className="row">
              <div className="col-12 col-md-10 col-lg-7 col-xl-6">
                <div className="position-relative" style={{ zIndex: 1 }}>
                  <h2
                    className="fw-bold mb-3 text-white"
                    style={{ fontSize: "clamp(1.6rem, 4vw, 2.8rem)", textShadow: "0 2px 18px rgba(0,0,0,0.4)" }}
                  >
                    Pronto a provarlo sul prossimo mese?
                  </h2>
                  <p
                    className="mb-4"
                    style={{ color: "rgba(255,255,255,0.88)", fontSize: "clamp(1rem, 2vw, 1.2rem)", textShadow: "0 2px 18px rgba(0,0,0,0.35)" }}
                  >
                    {session?.user?.email
                      ? `Sei autenticato come ${session.user.email}. Entra e continua da dove eri rimasto.`
                      : "Lasciaci i tuoi dati e ti ricontattiamo: ti aiutiamo a partire con calendari, turni e team."}
                  </p>
                  <div className="pt-1">
                    <ContactLeadForm />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
