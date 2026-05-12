import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { Providers } from "@/components/shell/Providers";

// IBM Plex pair — industrial-editorial workhorse. Sans for display + body,
// Mono for time slots, IDs, quote references. Loaded via next/font so the
// CSS is inlined at build time, no FOUT, no extra network round-trips.
// Exposed as --font-display and --font-mono so theme.ts can reference them
// without importing next-specific modules into the MUI theme file.
const display = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scheduling Assistant",
  description: "Brix demo - manager assigns quotes, technicians complete jobs",
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body style={{ margin: 0 }}>
        <AppRouterCacheProvider options={{ key: "mui" }}>
          <Providers>{children}</Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
