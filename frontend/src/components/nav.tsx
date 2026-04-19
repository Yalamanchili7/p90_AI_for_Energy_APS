"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Zap, Github } from "lucide-react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/methodology", label: "Methodology" },
];

const GITHUB_URL = "https://github.com/Yalamanchili7/p90_AI_for_Energy_APS";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-16 border-b border-ink-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
            <Zap className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="tracking-tight">P90</span>
          <span className="hidden text-xs font-normal text-ink-500 sm:inline">
            · feeder forecasting
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-ink text-white"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-2 flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink"
            aria-label="View on GitHub"
          >
            <Github className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </nav>
  );
}