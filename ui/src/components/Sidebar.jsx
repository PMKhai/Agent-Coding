import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../api";

// ─── refined 2-tone SVG icons ───────────────────────────────────────────────

const ICON = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const IconHome = () => (
  <svg {...ICON}>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
  </svg>
);

const IconChat = () => (
  <svg {...ICON}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />
    <path d="M8 12h.01M12 12h.01M16 12h.01" />
  </svg>
);

const IconAgents = () => (
  <svg {...ICON}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M8 6V4M16 6V4M12 18v2" opacity="0.6" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
  </svg>
);

const IconCommand = () => (
  <svg {...ICON}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 10l3 2-3 2M13 14h4" />
  </svg>
);

const IconMcp = () => (
  <svg {...ICON}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M4 7.5L12 12l8-4.5M12 12v9" opacity="0.6" />
  </svg>
);

const IconRepos = () => (
  <svg {...ICON}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" opacity="0.6" />
  </svg>
);

const IconUsage = () => (
  <svg {...ICON}>
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 3 3 5-6" />
  </svg>
);

const IconMonitor = () => (
  <svg {...ICON}>
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M8 20h8M12 18v2" />
    <path d="M7 11l2 2 3-4 2 3 3-2" opacity="0.6" />
  </svg>
);

const IconSettings = () => (
  <svg {...ICON}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconSun = () => (
  <svg {...ICON}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const IconMoon = () => (
  <svg {...ICON}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const IconPencil = () => (
  <svg {...ICON} width="13" height="13">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const IconLogoMark = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Two stacked Z-shaped strokes — distinctive FreeBird mark */}
    <path d="M5 5h10l-7 7h10" />
    <path d="M5 16h10l-7 4" opacity="0.7" />
  </svg>
);

// ─── nav config ─────────────────────────────────────────────────────────────

const main = [
  { to: "/", label: "Home", icon: IconHome, end: true },
  { to: "/chat", label: "Chat", icon: IconChat },
];

const configure = [
  { to: "/agents", label: "Agents & Skills", icon: IconAgents },
  { to: "/commands", label: "Commands", icon: IconCommand },
  { to: "/mcp", label: "MCP Servers", icon: IconMcp },
  { to: "/repos", label: "Repo Health", icon: IconRepos },
  { to: "/monitor", label: "Monitor", icon: IconMonitor },
  { to: "/usage", label: "Usage", icon: IconUsage },
];

const DEFAULT_WORKSPACE_NAME = "Platform";

// ─── nav item ───────────────────────────────────────────────────────────────

const COLLAPSED_KEY = "FreeBird:sidebar-collapsed";

function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(v) {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {
    /* noop */
  }
}

function NavItem({ to, label, icon: Icon, end, onClick, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-full text-[13px] font-medium transition-all ${
          collapsed ? "h-10 w-10 justify-center px-0" : "px-3.5 py-2"
        } ${
          isActive
            ? "bg-white/[0.05] text-slate-100"
            : "text-slate-500 hover:bg-white/[0.025] hover:text-slate-300"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Active glow dot at left when expanded */}
          {!collapsed && (
            <span
              className={`absolute -left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-opacity ${
                isActive ? "opacity-90" : "opacity-0"
              }`}
              style={{
                background: "rgb(129 140 248)",
                boxShadow: "0 0 6px rgb(129 140 248 / 0.5)",
              }}
              aria-hidden
            />
          )}
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center transition-colors ${
              isActive
                ? "text-indigo-200"
                : "text-slate-500 group-hover:text-slate-300"
            }`}
          >
            <Icon />
          </span>
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

// ─── workspace name (editable) ─────────────────────────────────────────────

function WorkspaceHeader({ onClose, collapsed, onToggleCollapse }) {
  const [name, setName] = useState(DEFAULT_WORKSPACE_NAME);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getWorkspaceName()
      .then((r) => {
        if (!cancelled) setName(r?.name || DEFAULT_WORKSPACE_NAME);
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (editing) {
      setDraft(name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, name]);

  async function commit() {
    const v = draft.trim();
    setEditing(false);
    try {
      const r = await api.setWorkspaceName(v);
      setName(r?.name || DEFAULT_WORKSPACE_NAME);
    } catch {
      /* keep current */
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(name);
  }

  useEffect(() => {
    try {
      document.title = name;
    } catch {
      /* noop */
    }
  }, [name]);

  return (
    <div className={collapsed ? "px-2 pb-4 pt-4" : "px-4 pb-5 pt-5"}>
      <div
        className={`group flex items-center ${collapsed ? "justify-center" : "gap-3"}`}
      >
        {/* Logo monogram with subtle gradient */}
        <button
          type="button"
          onClick={collapsed ? onToggleCollapse : undefined}
          title={collapsed ? "Expand sidebar" : undefined}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_4px_12px_-4px_rgba(99,102,241,0.6)] transition-transform hover:scale-105"
          style={{
            background:
              "linear-gradient(135deg, #6366f1 0%, #4f46e5 60%, #4338ca 100%)",
          }}
        >
          <IconLogoMark />
          <span
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-30"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 50%)",
            }}
            aria-hidden
          />
        </button>

        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              {editing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") cancel();
                  }}
                  maxLength={32}
                  className="w-full rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-sm font-semibold leading-tight text-white outline-none ring-1 ring-indigo-400/40 focus:ring-indigo-400/70"
                />
              ) : (
                <div className="flex items-center gap-1">
                  <h1
                    onDoubleClick={() => setEditing(true)}
                    className="truncate text-sm font-semibold leading-tight text-white"
                    title="Double-click to rename"
                  >
                    {name}
                  </h1>
                  <button
                    onClick={() => setEditing(true)}
                    title="Rename workspace"
                    className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 opacity-0 transition-all hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100"
                  >
                    <IconPencil />
                  </button>
                </div>
              )}
              <p className="truncate text-[11px] leading-tight text-slate-500">
                Multi-agent workspace
              </p>
            </div>

            {/* Collapse toggle — desktop only */}
            <button
              onClick={onToggleCollapse}
              title="Collapse sidebar"
              className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-white/[0.06] hover:text-slate-200 md:flex"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {/* Mobile close */}
            <button
              onClick={onClose}
              className="ml-auto rounded-full p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 md:hidden"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── main sidebar ───────────────────────────────────────────────────────────

export default function Sidebar({ theme, setTheme }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const location = useLocation();
  const isDark = theme === "dark";
  const close = () => setOpen(false);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      saveCollapsed(next);
      return next;
    });
  }

  const currentLabel =
    [...main, ...configure, { to: "/settings", label: "Settings" }].find((l) =>
      location.pathname.startsWith(l.to),
    )?.label || "Tasks";

  const body = (
    <>
      <WorkspaceHeader
        onClose={close}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />

      <div
        className={
          collapsed
            ? "mx-3 mb-3 h-px bg-white/5"
            : "mx-3 mb-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
        }
      />

      <nav
        className={`flex-1 overflow-y-auto pb-2 ${collapsed ? "px-2 space-y-1.5" : "px-3 space-y-0.5"} ${collapsed ? "flex flex-col items-center" : ""}`}
      >
        {main.map((l) => (
          <NavItem key={l.to} {...l} onClick={close} collapsed={collapsed} />
        ))}

        {collapsed ? (
          <div className="my-2 h-px w-6 bg-white/10" />
        ) : (
          <div className="px-3 pb-1 pt-4">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Configure
              </p>
              <span className="h-px flex-1 bg-white/5" />
            </div>
          </div>
        )}

        {configure.map((l) => (
          <NavItem key={l.to} {...l} onClick={close} collapsed={collapsed} />
        ))}
      </nav>

      <div
        className={`border-t border-white/[0.06] py-3 ${collapsed ? "px-2" : "px-3"}`}
      >
        <div
          className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}
        >
          <NavLink
            to="/settings"
            onClick={close}
            title={collapsed ? "Settings" : undefined}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-full font-medium transition-colors ${
                collapsed
                  ? "h-10 w-10 justify-center px-0 text-[12px]"
                  : "flex-1 px-3.5 py-2 text-[12px]"
              } ${
                isActive
                  ? "bg-white/[0.08] text-white"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              }`
            }
          >
            <span className="h-4 w-4">
              <IconSettings />
            </span>
            {!collapsed && "Settings"}
          </NavLink>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-100"
          >
            {isDark ? <IconSun /> : <IconMoon />}
          </button>
          {/* Expand button when collapsed */}
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              title="Expand sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-100"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
              online
            </span>
            <kbd className="rounded-full bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
              ⌘K
            </kbd>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="fixed left-0 right-0 top-0 z-40 flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 backdrop-blur-xl md:hidden"
        style={{
          background: "rgba(12,12,22,0.7)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <button
          onClick={() => setOpen(true)}
          className="p-1 text-slate-300 hover:text-white"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <span className="text-sm font-semibold text-white">{currentLabel}</span>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar — glassmorphism */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col text-slate-100 backdrop-blur-2xl
          transition-all duration-300 md:relative
          ${collapsed ? "w-[72px]" : "w-64"}
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{
          background:
            "linear-gradient(180deg, rgba(24,24,32,0.92) 0%, rgba(18,18,26,0.92) 50%, rgba(14,14,22,0.94) 100%)",
          boxShadow:
            "inset -1px 0 0 rgba(255,255,255,0.025), 0 10px 30px -12px rgba(0,0,0,0.35)",
          WebkitBackdropFilter: "blur(16px) saturate(140%)",
          backdropFilter: "blur(16px) saturate(140%)",
        }}
      >
        {/* Subtle top shimmer — softened */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)",
          }}
        />
        {/* Soft accent glow at top — toned down */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-28 w-44 -translate-x-1/2 rounded-full opacity-15 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col">{body}</div>
      </aside>
    </>
  );
}
