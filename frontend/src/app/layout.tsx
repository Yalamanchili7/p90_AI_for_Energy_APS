import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { DemoBanner } from "@/components/demo-banner";

export const metadata: Metadata = {
  title: "P90 — Spatio-temporal forecasting for distribution feeders",
  description:
    "Real-time feeder load forecasting, stress scenarios, and utility interventions. Built for the ASU Energy Hackathon APS challenge.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-ink-50 text-ink antialiased">
        <Nav />
        <main className="pt-16">
          <DemoBanner />
          {children}
        </main>
      </body>
    </html>
  );
}