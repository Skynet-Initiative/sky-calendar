import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@skynet-initiative/sky-calendar/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sky Calendar",
  description:
    "Calendriers partagés, événements récurrents et planification Skynet.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
