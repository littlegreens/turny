"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  orgSlug: string;
  orgName: string;
  isWorkerOnly?: boolean;
  isSuperAdmin?: boolean;
};

export function OrgSidebar({ orgSlug, orgName, isWorkerOnly = false, isSuperAdmin = false }: Props) {
  const pathname = usePathname();
  const storageKey = "turny.sidebar.collapsed";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(storageKey) === "1");
  }, []);

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }

  function SidebarToggleIcon() {
    return <Image src="/thumbnail_ba.svg" alt="" width={18} height={18} aria-hidden="true" />;
  }

  function NavLinks({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
    const pathAfterOrg = pathname.startsWith(`/${orgSlug}/`) ? pathname.slice(`/${orgSlug}`.length) : "";
    const knownOrgRoutes = ["/turni", "/members", "/settings", "/calendari", "/archivio-turni"];
    const isCalendariActive = pathAfterOrg === "/calendari" ||
      (pathAfterOrg.length > 1 && !knownOrgRoutes.some((r) => pathAfterOrg.startsWith(r)) && !pathAfterOrg.includes("/schedules"));
    const isTurniActive = pathAfterOrg === "/turni" || pathAfterOrg === "/archivio-turni" || pathAfterOrg.includes("/schedules");
    const isPersoneActive = pathAfterOrg.startsWith("/members");
    const isSettingsActive = pathAfterOrg === "/settings";
    const isDashboardActive = pathname === `/${orgSlug}`;

    return (
      <>
        <Link
          href="/"
          onClick={onNavigate}
          className={`sidebar-link ${pathname === "/" ? "active" : ""}`}
          title="Home"
        >
          <Image src="/home.svg" alt="" width={24} height={24} />
          {!compact ? <span className="turny-sidebar-label">Home</span> : null}
        </Link>

        {!isWorkerOnly ? (
          <>
            <Link
              href={`/${orgSlug}`}
              onClick={onNavigate}
              className={`sidebar-link mt-2 ${isDashboardActive ? "active" : ""}`}
              title="Dashboard"
            >
              <Image src="/dashboard.svg" alt="" width={24} height={24} />
              {!compact ? <span className="turny-sidebar-label">Dashboard</span> : null}
            </Link>
            <Link
              href={`/${orgSlug}/calendari`}
              onClick={onNavigate}
              className={`sidebar-link mt-2 ${isCalendariActive ? "active" : ""}`}
              title="Calendari"
            >
              <Image src="/calendar.svg" alt="" width={24} height={24} />
              {!compact ? <span className="turny-sidebar-label">Calendari</span> : null}
            </Link>
            <Link
              href={`/${orgSlug}/members`}
              onClick={onNavigate}
              className={`sidebar-link mt-2 ${isPersoneActive ? "active" : ""}`}
              title="Persone"
            >
              <Image src="/person.svg" alt="" width={24} height={24} />
              {!compact ? <span className="turny-sidebar-label">Persone</span> : null}
            </Link>
          </>
        ) : null}
        {isWorkerOnly ? (
          <Link
            href={`/${orgSlug}/members`}
            onClick={onNavigate}
            className={`sidebar-link mt-2 ${isPersoneActive ? "active" : ""}`}
            title="I miei dati"
          >
            <Image src="/person.svg" alt="" width={24} height={24} />
            {!compact ? <span className="turny-sidebar-label">I miei dati</span> : null}
          </Link>
        ) : null}
        <Link
          href={`/${orgSlug}/turni`}
          onClick={onNavigate}
          className={`sidebar-link mt-2 ${isTurniActive ? "active" : ""}`}
          title="Turni"
        >
          <Image src="/badge.svg" alt="" width={22} height={22} style={{ transform: "translateY(-1px)", opacity: 1 }} />
          {!compact ? <span className="turny-sidebar-label">Turni</span> : null}
        </Link>
        {!isWorkerOnly ? (
          <>
            <Link
              href={`/${orgSlug}/settings`}
              onClick={onNavigate}
              className={`sidebar-link mt-2 ${isSettingsActive ? "active" : ""}`}
              title="Impostazioni"
            >
              <Image src="/setting.svg" alt="" width={24} height={24} />
              {!compact ? <span className="turny-sidebar-label">Impostazioni</span> : null}
            </Link>
            {isSuperAdmin ? (
              <Link
                href="/admin"
                onClick={onNavigate}
                className={`sidebar-link mt-2 ${pathname === "/admin" || pathname.startsWith("/admin/") ? "active" : ""}`}
                title="Admin"
              >
                <Image src="/dashboard.svg" alt="" width={24} height={24} />
                {!compact ? <span className="turny-sidebar-label">Admin</span> : null}
              </Link>
            ) : null}
          </>
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="turny-sidebar-toggle-btn d-lg-none position-fixed"
        style={{ top: 14, left: 12, zIndex: 1062 }}
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label={mobileOpen ? "Chiudi menu navigazione" : "Apri menu navigazione"}
      >
        <SidebarToggleIcon />
      </button>
      <>
        <div
          className={`turny-mobile-sidebar d-lg-none ${mobileOpen ? "is-open" : ""}`}
          tabIndex={-1}
          aria-hidden={!mobileOpen}
          style={{ zIndex: 1065 }}
        >
          <div className="offcanvas-header">
            <h5 className="offcanvas-title">{orgName}</h5>
            <button type="button" className="turny-sidebar-toggle-btn" aria-label="Chiudi" onClick={() => setMobileOpen(false)}>
              <SidebarToggleIcon />
            </button>
          </div>
          <div className="offcanvas-body">
            <nav className="d-flex flex-column gap-1">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </nav>
          </div>
        </div>
        <button
          type="button"
          className={`turny-mobile-sidebar-backdrop d-lg-none ${mobileOpen ? "is-open" : ""}`}
          style={{ zIndex: 1060 }}
          onClick={() => setMobileOpen(false)}
          aria-hidden={!mobileOpen}
          tabIndex={mobileOpen ? 0 : -1}
          aria-label="Chiudi menu navigazione"
        />
      </>

      <aside className="d-none d-lg-flex border-end bg-white" style={{ minHeight: "100vh" }}>
        <div style={{ width: collapsed ? 68 : 280 }} className="p-2 turny-desktop-sidebar-shell">
          <div className="d-flex align-items-center justify-content-between mb-3">
            {!collapsed ? <strong className="small text-secondary">{orgName}</strong> : <span />}
            <button
              type="button"
              className="turny-sidebar-toggle-btn"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Apri menu" : "Chiudi menu"}
            >
              <SidebarToggleIcon />
            </button>
          </div>

          <nav className="d-flex flex-column gap-1">
            <NavLinks compact={collapsed} />
          </nav>
        </div>
      </aside>
    </>
  );
}
