// Shim for `next/link` on top of wouter's Link.
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link as WouterLink } from "wouter";

type NextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string };
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  locale?: string | false;
};

const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, children, prefetch, replace, scroll, shallow, passHref, locale, ...rest },
  ref,
) {
  const to = typeof href === "string" ? href : href?.pathname ?? "#";
  return (
    <WouterLink href={to} ref={ref} {...rest}>
      {children}
    </WouterLink>
  );
});

export default Link;
