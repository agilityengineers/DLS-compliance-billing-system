import { lazy, Suspense, useEffect } from "react";
import { Router, useLocation } from "wouter";
import { useBrowserLocation } from "wouter/use-browser-location";
import { AsyncRoute } from "@/components/async-route";
import LoginPage from "@/app/(auth)/login/page";
import { setNavigate } from "@/shims/nav-bridge";

// Do not download every authenticated page just to display the sign-in form.
const Portal = lazy(() => import("./App"));
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoginRoute() {
  const [, navigate] = useLocation();
  useEffect(() => {
    setNavigate((to, opts) => navigate(to, opts));
  }, [navigate]);
  return <AsyncRoute loader={LoginPage} />;
}

export default function PortalEntry() {
  const [location] = useBrowserLocation();
  if (location === `${base}/login` || location === `${base}/login/`) {
    return <Router base={base}><LoginRoute /></Router>;
  }
  return (
    <Suspense fallback={<p role="status" className="p-8 text-center">Loading the DLS Portal…</p>}>
      <Portal />
    </Suspense>
  );
}
