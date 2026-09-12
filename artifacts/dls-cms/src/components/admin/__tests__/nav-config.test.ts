// The provider's menu: grouped, complete, and highlighting the right entry.
import { describe, expect, it } from "vitest";
import { ADMIN_NAV, PLATFORM_LINKS, PLATFORM_NAV, activeHref, navForRole } from "../nav-config";

describe("provider navigation", () => {
  it("gives the Super Admin the categorized platform console and nothing else", () => {
    const sections = navForRole("Super_Admin", new Set());
    expect(sections).toBe(PLATFORM_NAV);
    expect(sections.map((s) => s.label)).toEqual(["Overview", "Organizations & people", "Capabilities", "Security & compliance", "System"]);
    expect(sections.every((s) => s.defaultOpen)).toBe(true);
    const hrefs = PLATFORM_LINKS.map((l) => l.href);
    expect(hrefs).toEqual([
      "/admin/platform",
      "/admin/platform/organizations",
      "/admin/platform/accounts",
      "/admin/platform/features",
      "/admin/platform/adoption",
      "/admin/platform/support",
      "/admin/platform/sessions",
      "/admin/platform/audit",
      "/admin/platform/system",
    ]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    // No provider entry is feature-gated or opens an organization screen.
    expect(PLATFORM_LINKS.every((l) => l.href.startsWith("/admin/platform") && !l.feature)).toBe(true);
    expect(PLATFORM_LINKS.every((l) => Boolean(l.description) && Boolean(l.icon))).toBe(true);
  });

  it("highlights the most specific entry for the current path", () => {
    expect(activeHref(PLATFORM_NAV, "/admin/platform")).toBe("/admin/platform");
    expect(activeHref(PLATFORM_NAV, "/admin/platform/accounts")).toBe("/admin/platform/accounts");
    expect(activeHref(PLATFORM_NAV, "/admin/platform/accounts/")).toBe("/admin/platform/accounts");
    expect(activeHref(PLATFORM_NAV, "/admin/platformx")).toBeNull();
    expect(activeHref(ADMIN_NAV, "/admin")).toBe("/admin");
    expect(activeHref(ADMIN_NAV, "/admin/clients/new")).toBe("/admin/clients");
    expect(activeHref(ADMIN_NAV, "/login")).toBeNull();
  });

  it("keeps the organization menus unchanged for admins and schedulers", () => {
    const admin = navForRole("Admin", new Set(["clients.core", "billing.claims"]));
    expect(admin.find((s) => s.key === "CORE")?.defaultOpen).toBe(true);
    expect(admin.flatMap((s) => s.items).map((i) => i.href)).toEqual(["/admin", "/admin/clients", "/admin/billing", "/admin/settings"]);
    const scheduler = navForRole("Scheduler", new Set(["clients.core"]), new Set(["clients.core", "billing.claims"]));
    expect(scheduler.flatMap((s) => s.items).map((i) => i.href)).toEqual(["/admin", "/admin/clients", "/admin/billing"]);
  });
});
