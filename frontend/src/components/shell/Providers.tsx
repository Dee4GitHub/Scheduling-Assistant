"use client";

import { useState } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { theme } from "@/theme";
import { RoleProvider } from "@/components/role/RoleContext";
import { AppShell } from "@/components/shell/AppShell";

// All client-only providers in one wrapper. Kept out of app/layout.tsx so the
// layout can stay server-rendered and only the interactive shell is shipped
// to the client. QueryClient is constructed inside useState so React's
// reconciliation doesn't recreate it on every render — the standard
// TanStack Query Next.js pattern.

export function Providers({ children }: { readonly children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Bell-icon polls only on window focus (per the decision in PR #6
            // planning). No interval-based refetch — production-grade for a
            // demo without adding load against the dev DB on idle tabs.
            refetchOnWindowFocus: true,
            // Don't retry against a developer DB that's intentionally down;
            // a single failed fetch is a clear signal to the reviewer.
            retry: 1,
            // 30 seconds before background revalidation kicks in. The
            // domain is low-velocity (jobs assigned at human pace), so
            // we don't need millisecond freshness.
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RoleProvider>
          <AppShell>{children}</AppShell>
        </RoleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
