import { useEffect, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AsyncRoute, type PageProps } from "@/components/async-route";
import { setNavigate } from "@/shims/nav-bridge";

// ── Layouts (async server components) ─────────────────────────────────────
import AdminLayout from "@/app/admin/layout";
import FieldLayout from "@/app/field/layout";

// ── Root / auth pages ─────────────────────────────────────────────────────
import Home from "@/app/page";
import LoginPage from "@/app/(auth)/login/page";

// ── Admin pages ───────────────────────────────────────────────────────────
import AdminDashboard from "@/app/admin/page";
import AdminAudit from "@/app/admin/audit/page";
import AdminBilling from "@/app/admin/billing/page";
import AdminClients from "@/app/admin/clients/page";
import AdminClientNew from "@/app/admin/clients/new/page";
import AdminDocuments from "@/app/admin/documents/page";
import AdminEmar from "@/app/admin/emar/page";
import AdminEvv from "@/app/admin/evv/page";
import AdminIncidents from "@/app/admin/incidents/page";
import AdminPayroll from "@/app/admin/payroll/page";
import AdminQa from "@/app/admin/qa/page";
import AdminRelias from "@/app/admin/relias/page";
import AdminReports from "@/app/admin/reports/page";
import AdminSchedule from "@/app/admin/schedule/page";
import AdminSettings from "@/app/admin/settings/page";
import AdminStaff from "@/app/admin/staff/page";

// ── Field pages ───────────────────────────────────────────────────────────
import FieldToday from "@/app/field/page";
import FieldDocuments from "@/app/field/documents/page";
import FieldEmar from "@/app/field/emar/page";
import FieldIncident from "@/app/field/incident/page";
import FieldMore from "@/app/field/more/page";
import FieldTimesheet from "@/app/field/timesheet/page";
import FieldTraining from "@/app/field/training/page";
import FieldVisit from "@/app/field/visits/[id]/page";
import FieldVisitNote from "@/app/field/visits/[id]/note/page";
import FieldWeek from "@/app/field/week/page";

const queryClient = new QueryClient();

type AsyncComponent = (props: never) => Promise<ReactNode>;

type LayoutFn = (p: { children: ReactNode }) => Promise<ReactNode>;

/** Compose an async layout around an async server page (layout auth-gates). */
function withLayout(Layout: LayoutFn, Page: AsyncComponent) {
  return async (props: PageProps): Promise<ReactNode> => {
    const child = await Page(props as never);
    return Layout({ children: child });
  };
}

/**
 * Compose an async layout around a CLIENT-component page. The page uses React
 * hooks, so it must be rendered as an element (not called) — we pass it as the
 * layout's children.
 */
function withLayoutElement(Layout: LayoutFn, element: ReactNode) {
  return async (): Promise<ReactNode> => Layout({ children: element });
}

/** Register wouter's base-aware navigate for the shim bridge. */
function NavigationBridge() {
  const [, navigate] = useLocation();
  useEffect(() => {
    setNavigate((to, opts) => navigate(to, opts));
  }, [navigate]);
  return null;
}

function Router() {
  const [loc] = useLocation();
  // Key the Switch by location so the matched route subtree fully remounts on
  // navigation. Without this, React reuses the single <AsyncRoute> instance
  // across route changes and carries over stale loader/redirect state.
  return (
    <Switch key={loc}>
      {/* Root + auth */}
      <Route path="/">{() => <AsyncRoute loader={Home as AsyncComponent} />}</Route>
      <Route path="/login">{() => <AsyncRoute loader={LoginPage as AsyncComponent} />}</Route>

      {/* Admin console */}
      <Route path="/admin">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminDashboard as AsyncComponent)} />}</Route>
      <Route path="/admin/audit">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminAudit as AsyncComponent)} />}</Route>
      <Route path="/admin/billing">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminBilling as AsyncComponent)} />}</Route>
      <Route path="/admin/clients">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminClients as AsyncComponent)} />}</Route>
      <Route path="/admin/clients/new">{() => <AsyncRoute loader={withLayoutElement(AdminLayout, <AdminClientNew />)} />}</Route>
      <Route path="/admin/documents">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminDocuments as AsyncComponent)} />}</Route>
      <Route path="/admin/emar">{() => <AsyncRoute loader={withLayoutElement(AdminLayout, <AdminEmar />)} />}</Route>
      <Route path="/admin/evv">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminEvv as AsyncComponent)} />}</Route>
      <Route path="/admin/incidents">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminIncidents as AsyncComponent)} />}</Route>
      <Route path="/admin/payroll">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminPayroll as AsyncComponent)} />}</Route>
      <Route path="/admin/qa">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminQa as AsyncComponent)} />}</Route>
      <Route path="/admin/relias">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminRelias as AsyncComponent)} />}</Route>
      <Route path="/admin/reports">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminReports as AsyncComponent)} />}</Route>
      <Route path="/admin/schedule">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminSchedule as AsyncComponent)} />}</Route>
      <Route path="/admin/settings">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminSettings as AsyncComponent)} />}</Route>
      <Route path="/admin/staff">{() => <AsyncRoute loader={withLayout(AdminLayout, AdminStaff as AsyncComponent)} />}</Route>

      {/* Field app */}
      <Route path="/field">{() => <AsyncRoute loader={withLayoutElement(FieldLayout, <FieldToday />)} />}</Route>
      <Route path="/field/documents">{() => <AsyncRoute loader={withLayout(FieldLayout, FieldDocuments as AsyncComponent)} />}</Route>
      <Route path="/field/emar">{() => <AsyncRoute loader={withLayoutElement(FieldLayout, <FieldEmar />)} />}</Route>
      <Route path="/field/incident">{() => <AsyncRoute loader={withLayout(FieldLayout, FieldIncident as AsyncComponent)} />}</Route>
      <Route path="/field/more">{() => <AsyncRoute loader={withLayout(FieldLayout, FieldMore as AsyncComponent)} />}</Route>
      <Route path="/field/timesheet">{() => <AsyncRoute loader={withLayout(FieldLayout, FieldTimesheet as AsyncComponent)} />}</Route>
      <Route path="/field/training">{() => <AsyncRoute loader={withLayout(FieldLayout, FieldTraining as AsyncComponent)} />}</Route>
      <Route path="/field/week">{() => <AsyncRoute loader={withLayoutElement(FieldLayout, <FieldWeek />)} />}</Route>
      <Route path="/field/visits/:id/note">
        {(params) => <AsyncRoute loader={withLayoutElement(FieldLayout, <FieldVisitNote />)} params={params} />}
      </Route>
      <Route path="/field/visits/:id">
        {(params) => <AsyncRoute loader={withLayoutElement(FieldLayout, <FieldVisit />)} params={params} />}
      </Route>

      {/* Fallback → role router */}
      <Route>{() => <AsyncRoute loader={Home as AsyncComponent} />}</Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <NavigationBridge />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
