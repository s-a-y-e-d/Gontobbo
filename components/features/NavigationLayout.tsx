"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import Link from "next/link";

function Breadcrumbs() {
  const pathname = usePathname();

  // Build breadcrumb segments from the path
  const segments = pathname.split("/").filter(Boolean);

  // Default: always show "Subjects" as root
  const crumbs: { label: string; href: string }[] = [
    { label: "Subjects", href: "/" },
  ];

  if (segments[0] === "subjects" && segments[1]) {
    // Subject page: /subjects/[slug]
    // Capitalize slug for display (will be replaced by actual name via the page)
    const subjectSlug = segments[1];
    const displayName = decodeURIComponent(subjectSlug)
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    crumbs.push({ label: displayName, href: `/subjects/${subjectSlug}` });

    if (segments[2]) {
      // Chapter page: /subjects/[slug]/[chapterSlug]
      const chapterSlug = segments[2];
      const chapterDisplay = decodeURIComponent(chapterSlug)
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      crumbs.push({
        label: chapterDisplay,
        href: `/subjects/${subjectSlug}/${chapterSlug}`,
      });
    }
  } else if (segments[0] === "logs") {
    crumbs.push({ label: "Logs", href: "/logs" });
  }

  return (
    <div className="flex items-center text-sm font-medium text-slate-500 dark:text-slate-400">
      {crumbs.map((crumb, i) => (
        <React.Fragment key={crumb.href}>
          {i > 0 && (
            <span className="material-symbols-outlined text-[16px] mx-1 opacity-70">
              chevron_right
            </span>
          )}
          {i === crumbs.length - 1 ? (
            <span className="text-slate-900 dark:text-white font-semibold">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function NavigationLayout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const currentDate = useMemo(() => {
    if (!mounted) return "";
    return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }, [mounted]);

  // Determine active nav item
  const isSubjectsActive = pathname === "/" || pathname.startsWith("/subjects");
  const isLogsActive = pathname === "/logs" || pathname.startsWith("/logs");

  return (
    <div className="antialiased min-h-screen pb-24 md:pb-0 md:pl-64 flex flex-col">
      {/* SideNavBar (Web) */}
      <nav className="bg-white dark:bg-slate-900 font-body text-sm font-medium w-64 border-r border-black/5 dark:border-white/5 shadow-none flex-col gap-1 p-4 fixed left-0 top-0 h-full hidden md:flex z-50">
        <div className="flex items-center gap-3 px-4 py-6 mb-4">
          <span className="material-symbols-outlined text-brand-green" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-white leading-tight">StudyOS</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-0.5">Productivity Suite</div>
          </div>
        </div>
        
        <div className="flex-1 space-y-1">
          <Link className="flex items-center gap-3 px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98]" href="#">
            <span className="material-symbols-outlined text-lg">dashboard</span>
            Dashboard
          </Link>
          <Link
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all active:scale-[0.98] ${
              isSubjectsActive
                ? "text-brand-green bg-emerald-50/50 dark:bg-emerald-900/10"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
            }`}
            href="/"
          >
            <span className="material-symbols-outlined text-lg">auto_stories</span>
            Subjects
          </Link>
          <Link className="flex items-center gap-3 px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98]" href="#">
            <span className="material-symbols-outlined text-lg">psychology</span>
            AI Planner
          </Link>
          <Link className="flex items-center gap-3 px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98]" href="#">
            <span className="material-symbols-outlined text-lg">calendar_today</span>
            Today Plan
          </Link>
          <Link className="flex items-center gap-3 px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98]" href="#">
            <span className="material-symbols-outlined text-lg">query_stats</span>
            Progress
          </Link>
          <Link className="flex items-center gap-3 px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98]" href="#">
            <span className="material-symbols-outlined text-lg">history_edu</span>
            Revision
          </Link>
          <Link
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all active:scale-[0.98] ${
              isLogsActive
                ? "text-brand-green bg-emerald-50/50 dark:bg-emerald-900/10"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
            }`}
            href="/logs"
          >
            <span className="material-symbols-outlined text-lg">format_list_bulleted</span>
            Logs
          </Link>
          <Link className="flex items-center gap-3 px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98]" href="#">
            <span className="material-symbols-outlined text-lg">settings</span>
            Settings
          </Link>
        </div>
        
        <div className="mt-auto px-4 py-4">
          <button className="w-full bg-near-black text-white rounded-full py-2.5 font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm">add</span>
            New Study Session
          </button>
        </div>
      </nav>

      {/* TopNavBar */}
      <header className="bg-white/80 dark:bg-slate-950/80 backdrop-blur-md font-body text-[15px] font-medium tracking-tight sticky top-0 z-40 border-b border-black/5 dark:border-white/5 shadow-none flex justify-between items-center w-full px-6 h-16 hidden md:flex">
        <Breadcrumbs />
        <div className="flex items-center gap-6">
          <span className="text-sm text-slate-500">{currentDate}</span>
          <div className="flex items-center gap-3 text-slate-500">
            <button className="hover:text-brand-green transition-colors duration-200 opacity-90 hover:opacity-100"><span className="material-symbols-outlined">local_fire_department</span></button>
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="hover:text-brand-green transition-colors duration-200 opacity-90 hover:opacity-100"
            >
              <span className="material-symbols-outlined">
                {mounted && theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <button className="hover:text-brand-green transition-colors duration-200 opacity-90 hover:opacity-100"><span className="material-symbols-outlined">notifications</span></button>
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center">
            <img alt="Student Profile Avatar" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQHSCY5tzAn6ImxgAIUrvnBxTsfM4WmTIphkFjmEaY2epp7zaC9Y2wlcbffnn5OloFCXiSqmPi2bqza_G6nGrJqxpKlH7T-SEc74gcMiT7kZJ-EtwbqhvCSdcEHq13HqO6-Brm36_rAcQ6JTcrhe2JMiD8i6eC0NVeexm11d7JRwOSEV90OXqNTAH3HvP2rt5RmtHv-XAu-ZeDHWWx5THNCewM5F12i2jmu282tM6IuoC_47guCRzdAIL7uAi_oYGY0siibrFvnyu0"/>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-6 py-section-y-sm">
        {children}
      </main>

      {/* BottomNavBar (Mobile) */}
      <nav className="bg-white dark:bg-slate-950 font-body text-[10px] font-medium md:hidden border-t border-black/5 dark:border-white/5 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-3 pb-safe">
        <Link className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-800 transition-all p-2 rounded-xl" href="#">
          <span className="material-symbols-outlined text-2xl mb-1">home</span>
          Home
        </Link>
        <Link className={`flex flex-col items-center justify-center rounded-2xl px-3 py-1 transition-all ${isSubjectsActive ? "text-brand-green bg-emerald-50 dark:bg-emerald-900/20" : "text-slate-400 dark:text-slate-500"}`} href="/">
          <span className="material-symbols-outlined text-2xl mb-1" style={{ fontVariationSettings: isSubjectsActive ? "'FILL' 1" : "'FILL' 0" }}>book</span>
          Subjects
        </Link>
        <Link className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-800 transition-all p-2 rounded-xl" href="#">
          <span className="material-symbols-outlined text-2xl mb-1">event_note</span>
          Planner
        </Link>
        <Link className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-800 transition-all p-2 rounded-xl" href="#">
          <span className="material-symbols-outlined text-2xl mb-1">bar_chart</span>
          Progress
        </Link>
      </nav>
    </div>
  );
}
