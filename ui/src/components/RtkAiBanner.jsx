// Floating bottom-right banner prompting the user to enable RTK
// (Rust Token Killer — https://github.com/rtk-ai/rtk) to reduce token usage
// when running Claude Code. RTK is a LOCAL Rust CLI + Bash hook, NOT a
// remote API — it intercepts Claude's Bash tool calls and rewrites their
// output to be 60–90% smaller. Works fully offline, no API key.
//
// localStorage keys:
//   - FreeBird:rtkai-status     →  "configured" | "skipped"
//   - FreeBird:rtkai-config     →  { mode, configuredAt, ... }
//
// To re-trigger the banner, run in DevTools:
//   localStorage.removeItem("FreeBird:rtkai-status")
//
// TODO(rtk-integration): the current autoConfigure() is a stub — it only
// flips a localStorage flag. To make it real, the UI needs a backend
// endpoint (e.g. POST /api/rtk/install) that runs the install + init flow
// on the host. See autoConfigure() below for the full install spec.

import { useEffect, useState } from "react";
import { toast } from "sonner";

const STATUS_KEY = "FreeBird:rtkai-status";
const CONFIG_KEY = "FreeBird:rtkai-config";

function loadStatus() {
  try {
    return localStorage.getItem(STATUS_KEY);
  } catch {
    return null;
  }
}

function saveStatus(s) {
  try {
    localStorage.setItem(STATUS_KEY, s);
  } catch {
    /* noop */
  }
}

function saveConfig(c) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  } catch {
    /* noop */
  }
}

export default function RtkAiBanner() {
  const [status, setStatus] = useState(loadStatus);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Defer mount so the banner doesn't fight onboarding/first paint.
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 600);
    return () => clearTimeout(t);
  }, []);

  if (status === "configured" || status === "skipped" || !mounted) return null;

  // Installs RTK (https://github.com/rtk-ai/rtk) globally and registers
  // the Claude Code Bash hook so token-heavy command output is compressed.
  // Flow: detect → install (if missing) → init (patches ~/.claude/settings.json)
  // → verify. Backend endpoints live in ui/server/routes/rtk.js.
  async function autoConfigure() {
    setBusy(true);
    try {
      const det = await fetch("/api/rtk/detect").then((r) => r.json());
      if (!det.installed) {
        toast.loading("Installing rtk via Homebrew…", { id: "rtk-install" });
        const inst = await fetch("/api/rtk/install", { method: "POST" }).then(
          (r) => r.json(),
        );
        if (inst.error) throw new Error(inst.error);
      }
      toast.loading("Registering Claude hook…", { id: "rtk-install" });
      const init = await fetch("/api/rtk/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global" }),
      }).then((r) => r.json());
      if (init.error) throw new Error(init.error);

      const ver = await fetch("/api/rtk/verify").then((r) => r.json());
      saveConfig({
        mode: "auto",
        provider: "rtk-ai",
        scope: "global",
        configuredAt: new Date().toISOString(),
        installed: ver.installed,
        version: ver.version,
        hookActive: ver.hookActive,
      });
      saveStatus("configured");
      setStatus("configured");
      toast.success("RTK installed globally", {
        id: "rtk-install",
        description: `${ver.version || "rtk"} — restart Claude Code to activate the Bash hook.`,
        duration: 5000,
      });
    } catch (err) {
      toast.error("RTK install failed", {
        id: "rtk-install",
        description: String(err.message || err),
        duration: 6000,
      });
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    saveStatus("skipped");
    setStatus("skipped");
    toast("RTK-AI skipped", {
      description: "You can enable it later from Settings.",
      duration: 2500,
    });
  }

  return (
    <div className="cofounder-skin fixed bottom-4 right-4 z-[55] w-[340px] max-w-[calc(100vw-2rem)]">
      <div className="relative overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]">
        {/* Accent stripe */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5"
          style={{
            background: "linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)",
          }}
        />
        {/* Soft glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-2xl"
          style={{ background: "#f59e0b" }}
        />

        <div className="relative flex items-start gap-3 px-4 pb-3 pt-4">
          {/* Warning icon */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-co"
            style={{
              background:
                "linear-gradient(135deg, #f59e0b33 0%, #f59e0b14 100%)",
              color: "#d97706",
              boxShadow: "inset 0 0 0 1px #f59e0b33",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <circle cx="12" cy="17" r="0.9" fill="currentColor" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-co-fg/45">
                Action needed
              </span>
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                RTK-AI
              </span>
            </div>
            <h3 className="mt-0.5 text-sm font-semibold tracking-tight text-co-fg">
              Optimize tokens with RTK-AI
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-co-fg/60">
              Route requests through the token-optimizer to save cost and speed
              up agent runs. Auto-config takes one click.
            </p>
          </div>

          {/* Dismiss */}
          <button
            onClick={skip}
            title="Skip"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-co-fg/40 transition-colors hover:bg-co-fg/[0.06] hover:text-co-fg"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2 border-t border-co-fg/10 bg-co-bg/40 px-4 py-2.5">
          <button
            onClick={skip}
            className="rounded-co-sm px-2.5 py-1.5 text-xs font-medium text-co-fg/55 transition-colors hover:bg-co-fg/[0.06] hover:text-co-fg"
          >
            Maybe later
          </button>
          <div className="flex-1" />
          <button
            onClick={autoConfigure}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-co-sm bg-co-primary px-3.5 py-1.5 text-xs font-semibold text-co-primary-fg shadow-[0_2px_8px_-2px_rgba(0,0,0,0.25)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                className="animate-spin"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-25"
                />
                <path
                  d="M4 12a8 8 0 018-8"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-75"
                />
              </svg>
            ) : (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            )}
            {busy ? "Configuring…" : "Auto config"}
          </button>
        </div>
      </div>
    </div>
  );
}
