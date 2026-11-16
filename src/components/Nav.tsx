"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/study", label: "Study", icon: "🃏" },
  { href: "/quiz", label: "Quiz", icon: "🎯" },
  { href: "/cards", label: "Cards", icon: "📚" },
  { href: "/add", label: "Add", icon: "➕" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <header className="hidden sm:block border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="font-hanzi text-xl font-bold text-seal">字卡</Link>
          <nav className="flex gap-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg transition ${active(l.href) ? "bg-paper-2 text-ink font-medium" : "text-ink-soft hover:text-ink"}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-col items-center py-2 text-[11px] ${active(l.href) ? "text-seal font-semibold" : "text-ink-soft"}`}
            >
              <span className="text-lg leading-none mb-0.5">{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
