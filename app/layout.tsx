import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS Onsite Travel",
  description: "Upcoming customer onsite travel for the CS team.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
