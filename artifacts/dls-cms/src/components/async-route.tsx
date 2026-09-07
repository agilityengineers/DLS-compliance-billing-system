// Runs a Next-style async page/layout component on the client: awaits it,
// catches redirect()/notFound() control flow, and re-runs on revalidation.
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { isRedirectError } from "@/shims/redirect-error";
import { useRevalidate } from "@/shims/use-revalidate";

export type PageProps = {
  params: Record<string, string>;
  searchParams: Record<string, string>;
};

type Loader = (props: PageProps) => Promise<ReactNode> | ReactNode;

function RouteLoading() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-plum/30 border-t-plum" />
    </div>
  );
}

function RouteError({ error }: { error: Error }) {
  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="rounded-card border border-destructive/30 bg-destructive/5 p-4">
        <div className="label-caps text-destructive">Something went wrong</div>
        <p className="mt-1 text-sm text-foreground">{error.message}</p>
      </div>
    </div>
  );
}

export function AsyncRoute({
  loader,
  params,
}: {
  loader: Loader;
  params?: Record<string, string>;
}) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const rev = useRevalidate();
  const [node, setNode] = useState<ReactNode>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  const searchParams = Object.fromEntries(new URLSearchParams(search));
  const propsKey = JSON.stringify({ params: params ?? {}, searchParams });

  useEffect(() => {
    let cancelled = false;
    setNode(undefined);
    setError(null);
    setRedirectTo(null);
    Promise.resolve()
      .then(() => loader({ params: params ?? {}, searchParams }))
      .then((resolved) => {
        if (!cancelled) setNode(resolved);
      })
      .catch((e) => {
        if (cancelled) return;
        if (isRedirectError(e)) {
          setRedirectTo(e.to);
          return;
        }
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsKey, rev]);

  // Perform redirect() navigation once the loader has resolved to a redirect.
  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo]);

  if (error) return <RouteError error={error} />;
  if (redirectTo) return <RouteLoading />;
  if (node === undefined) return <RouteLoading />;
  return <>{node}</>;
}
