"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Props = {
  orgSlug: string;
  orgName: string;
  isWorkerOnly?: boolean;
};

export function OrgSidebar({ orgSlug, orgName, isWorkerOnly = false }: Props) {
  const pathname = usePathname();
  const storageKey = "turny.sidebar.collapsed";
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "1");

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside className="d-none d-lg-flex border-end bg-white" style={{ minHeight: "100vh" }}>
      <div style={{ width: collapsed ? 68 : 280 }} className="p-2">
        <div className="d-flex align-items-center justify-content-between mb-3">
          {!collapsed ? <strong className="small text-secondary">{orgName}</strong> : <span />}
          <button
            type="button"
            className="p-0 border-0 bg-transparent"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Apri menu" : "Chiudi menu"}
          >
            <Image src="/sidebar-toggle.svg" alt="Toggle menu" width={18} height={18} />
          </button>
        </div>

        <nav className="d-flex flex-column gap-1">
          <Link
            href="/"
            className={`sidebar-link ${pathname === "/" ? "active" : ""}`}
            title="Home"
          >
            <Image src="/dashboard.svg" alt="" width={24} height={24} />
            {!collapsed ? <span>Home</span> : null}
          </Link>

          {!isWorkerOnly ? (
            <Link
              href={`/${orgSlug}`}
              className={`sidebar-link mt-2 ${pathname === `/${orgSlug}` ? "active" : ""}`}
              title="Calendari"
            >
              <Image src="/calendar.svg" alt="" width={24} height={24} />
              {!collapsed ? <span>Calendari</span> : null}
            </Link>
          ) : null}
          <Link
            href={`/${orgSlug}/turni`}
            className={`sidebar-link mt-2 ${pathname === `/${orgSlug}/turni` || pathname.includes("/schedules/") ? "active" : ""}`}
            title="Turni"
          >
            <Image src="/badge.svg" alt="" width={22} height={22} style={{ transform: "translateY(-1px)", opacity: 1 }} />
            {!collapsed ? <span>Turni</span> : null}
          </Link>
          {!isWorkerOnly ? (
            <>
              <Link
                href={`/${orgSlug}/members`}
                className={`sidebar-link mt-2 ${pathname === `/${orgSlug}/members` ? "active" : ""}`}
                title="Membri"
              >
                <Image src="/person.svg" alt="" width={24} height={24} />
                {!collapsed ? <span>Membri</span> : null}
              </Link>
              <Link
                href={`/${orgSlug}/settings`}
                className={`sidebar-link mt-2 ${pathname === `/${orgSlug}/settings` ? "active" : ""}`}
                title="Settings"
              >
                <Image src="/setting.svg" alt="" width={24} height={24} />
                {!collapsed ? <span>Settings</span> : null}
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </aside>
  );
}
