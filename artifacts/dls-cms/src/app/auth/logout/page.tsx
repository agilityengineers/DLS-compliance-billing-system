"use client";

import { useEffect } from "react";
import { signOut } from "@/lib/auth/actions";

export default function LogoutPage() {
  useEffect(() => {
    void signOut().catch(() => {
      // The navigation shim implements redirect by throwing after navigation.
    });
  }, []);
  return <p className="p-6 text-sm text-muted-foreground">Signing out…</p>;
}