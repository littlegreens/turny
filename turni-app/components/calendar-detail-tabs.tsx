"use client";

import { useState, type ReactNode } from "react";

type TabDef = {
  key: string;
  label: string;
  content: ReactNode;
};

type Props = {
  tabs: TabDef[];
  defaultTab?: string;
};

export function CalendarDetailTabs({ tabs, defaultTab }: Props) {
  const [activeKey, setActiveKey] = useState(defaultTab ?? tabs[0]?.key ?? "");
  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <>
      <ul className="nav nav-tabs turny-nav-tabs mt-3" role="tablist">
        {tabs.map((tab) => (
          <li key={tab.key} className="nav-item" role="presentation">
            <button
              type="button"
              role="tab"
              className={`nav-link ${activeKey === tab.key ? "active" : ""}`}
              onClick={() => setActiveKey(tab.key)}
              aria-selected={activeKey === tab.key}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
      <div>{activeTab?.content}</div>
    </>
  );
}
