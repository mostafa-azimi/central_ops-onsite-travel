import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Central Ops Travel",
  description: "Customer onsite travel for the Central Ops team.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
