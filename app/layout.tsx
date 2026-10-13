import type { Metadata, Viewport } from "next";
import { Figtree, Gowun_Batang } from "next/font/google";
import { Suspense } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { ThemeToggle } from "@/components/theme-toggle";
import { PwaManager } from "@/components/pwa-manager";
import { NavigationProgress } from "@/components/navigation-progress";

const figtree = Figtree({ subsets: ["latin"], display: "swap", variable: "--font-figtree" });
const gowunBatang = Gowun_Batang({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-gowun-batang" });

export const metadata: Metadata = {
  title: "Central Ops Travel",
  description: "Customer onsite travel for the Central Ops team.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Central Ops Travel",
    statusBarStyle: "default",
  },
  icons: {
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f6fe" },
    { media: "(prefers-color-scheme: dark)", color: "#263444" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(function(){try{var t=localStorage.getItem('central-ops-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}})();`;
  return (
    <html lang="en" className={`${figtree.variable} ${gowunBatang.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Suspense fallback={null}><NavigationProgress /></Suspense>
        <ThemeToggle />
        <PwaManager />
        {children}
      </body>
    </html>
  );
}
