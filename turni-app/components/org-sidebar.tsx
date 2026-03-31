"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Props = {
  orgSlug: string;
  orgName: string;
  isWorkerOnly?: boolean;
  isSuperAdmin?: boolean;
};

export function OrgSidebar({ orgSlug, orgName, isWorkerOnly = false, isSuperAdmin = false }: Props) {
  const pathname = usePathname();
  const storageKey = "turny.sidebar.collapsed";
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "1");
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }

  function ToggleIcon({ isOpen }: { isOpen: boolean }) {
    return (
      <span className={`turny-toggle-icon ${isOpen ? "is-open" : ""}`} aria-hidden="true">
        <span className="turny-toggle-line" />
        <span className="turny-toggle-line" />
        <span className="turny-toggle-line" />
      </span>
    );
  }

  function NavLinks({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
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
              className={`sidebar-link mt-2 ${pathname === `/${orgSlug}` ? "active" : ""}`}
              title="Dashboard"
            >
              <Image src="/dashboard.svg" alt="" width={24} height={24} />
              {!compact ? <span className="turny-sidebar-label">Dashboard</span> : null}
            </Link>
            <Link
              href={`/${orgSlug}/calendari`}
              onClick={onNavigate}
              className={`sidebar-link mt-2 ${pathname === `/${orgSlug}/calendari` ? "active" : ""}`}
              title="Calendari"
            >
              <Image src="/calendar.svg" alt="" width={24} height={24} />
              {!compact ? <span className="turny-sidebar-label">Calendari</span> : null}
            </Link>
          </>
        ) : null}
        <Link
          href={`/${orgSlug}/turni`}
          onClick={onNavigate}
          className={`sidebar-link mt-2 ${pathname === `/${orgSlug}/turni` || pathname.includes("/schedules/") ? "active" : ""}`}
          title="Turni"
        >
          <Image src="/badge.svg" alt="" width={22} height={22} style={{ transform: "translateY(-1px)", opacity: 1 }} />
          {!compact ? <span className="turny-sidebar-label">Turni</span> : null}
        </Link>
        {!isWorkerOnly ? (
          <>
            <Link
              href={`/${orgSlug}/members`}
              onClick={onNavigate}
              className={`sidebar-link mt-2 ${pathname === `/${orgSlug}/members` ? "active" : ""}`}
              title="Membri"
            >
              <Image src="/person.svg" alt="" width={24} height={24} />
              {!compact ? <span className="turny-sidebar-label">Membri</span> : null}
            </Link>
            <Link
              href={`/${orgSlug}/settings`}
              onClick={onNavigate}
              className={`sidebar-link mt-2 ${pathname === `/${orgSlug}/settings` ? "active" : ""}`}
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
        <ToggleIcon isOpen={mobileOpen} />
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
            <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setMobileOpen(false)} />
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
              <ToggleIcon isOpen={!collapsed} />
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
