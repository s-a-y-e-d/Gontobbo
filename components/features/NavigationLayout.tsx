"use client";

import { UserButton } from "@clerk/nextjs";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

type NavItem = {
  icon: string;
  label: string;
  href?: string;
};

const primaryNavItems: NavItem[] = [
  { icon: "dashboard", label: "ড্যাশবোর্ড", href: "/" },
  { icon: "auto_stories", label: "বিষয়", href: "/subjects" },
  { icon: "psychology", label: "AI Planner", href: "/planner" },
  { icon: "calendar_today", label: "Todo", href: "/todo" },
  { icon: "history_edu", label: "রিভিশন", href: "/revision" },
  { icon: "format_list_bulleted", label: "লগ", href: "/logs" },
  { icon: "settings", label: "সেটিংস", href: "/settings" },
];

const bottomNavItems: NavItem[] = [
  { icon: "dashboard", label: "হোম", href: "/" },
  { icon: "book", label: "বিষয়", href: "/subjects" },
  { icon: "calendar_today", label: "Todo", href: "/todo" },
  { icon: "psychology", label: "AI Planner", href: "/planner" },
  { icon: "history_edu", label: "রিভিশন", href: "/revision" },
];

function Breadcrumbs() {
  const pathname = usePathname();

  // Build breadcrumb segments from the path
  const segments = pathname.split("/").filter(Boolean);

  // Default: always show dashboard as root
  const crumbs: { label: string; href: string }[] = [
    { label: "ড্যাশবোর্ড", href: "/" },
  ];

  if (segments[0] === "subjects") {
    crumbs.push({ label: "বিষয়", href: "/subjects" });
  }

  if (segments[0] === "subjects" && segments[1]) {
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
    crumbs.push({ label: "লগ", href: "/logs" });
  } else if (segments[0] === "revision") {
    crumbs.push({ label: "রিভিশন", href: "/revision" });
  } else if (segments[0] === "todo") {
    crumbs.push({ label: "করণীয়", href: "/todo" });
  }

  if (segments[0] === "planner") {
    crumbs.push({ label: "AI Planner", href: "/planner" });
  } else if (segments[0] === "settings") {
    crumbs.push({ label: "সেটিংস", href: "/settings" });
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
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const currentDate = useMemo(() => {
    if (!mounted) return "";
    return new Date().toLocaleDateString("bn-BD", { month: "long", day: "numeric", year: "numeric" });
  }, [mounted]);

  // Determine active nav item
  const isDashboardActive = pathname === "/";
  const isSubjectsActive =
    pathname === "/subjects" || pathname.startsWith("/subjects/");
  const isLogsActive = pathname === "/logs" || pathname.startsWith("/logs");
  const isTodoActive = pathname === "/todo" || pathname.startsWith("/todo");
  const isRevisionActive = pathname === "/revision";
  const isPlannerActive = pathname === "/planner" || pathname.startsWith("/planner");
  const isSettingsActive = pathname === "/settings" || pathname.startsWith("/settings");

  const getIsActive = (href?: string) => {
    if (!href) return false;
    if (href === "/") return isDashboardActive;
    if (href === "/subjects") return isSubjectsActive;
    if (href === "/todo") return isTodoActive;
    if (href === "/logs") return isLogsActive;
    if (href === "/revision") return isRevisionActive;
    if (href === "/planner") return isPlannerActive;
    if (href === "/settings") return isSettingsActive;
    return pathname === href;
  };

  const renderSidebarLink = (item: NavItem) => {
    const content = (
      <>
        <span className="material-symbols-outlined text-lg">{item.icon}</span>
        {item.label}
      </>
    );

    if (!item.href) {
      return (
        <button
          key={item.label}
          type="button"
          className="flex items-center gap-3 px-4 py-2.5 text-left text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98]"
        >
          {content}
        </button>
      );
    }

    return (
      <Link
        key={item.href}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all active:scale-[0.98] ${
          getIsActive(item.href)
            ? "text-brand-green bg-emerald-50/50 dark:bg-emerald-900/10"
            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
        }`}
        href={item.href}
      >
        {content}
      </Link>
    );
  };

  const renderMobileMenuLink = (item: NavItem) => {
    const content = (
      <>
        <span className="material-symbols-outlined">{item.icon}</span>
        {item.label}
      </>
    );

    if (!item.href) {
      return (
        <button
          key={item.label}
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-400 font-bold rounded-xl active:bg-slate-100 dark:active:bg-slate-800"
        >
          {content}
        </button>
      );
    }

    return (
      <Link
        key={item.href}
        onClick={() => setIsMobileMenuOpen(false)}
        className={`flex items-center gap-3 px-4 py-3 font-bold rounded-xl active:bg-slate-100 dark:active:bg-slate-800 ${
          getIsActive(item.href)
            ? "text-brand-green bg-emerald-50/50 dark:bg-emerald-900/10"
            : "text-slate-600 dark:text-slate-400"
        }`}
        href={item.href}
      >
        {content}
      </Link>
    );
  };

  const renderBottomNavLink = (item: NavItem) => {
    const isActive = getIsActive(item.href);

    if (!item.href) {
      return (
        <button
          key={item.label}
          type="button"
          className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 transition-all p-2 rounded-xl"
        >
          <span className="material-symbols-outlined text-2xl mb-0.5">{item.icon}</span>
          {item.label}
        </button>
      );
    }

    return (
      <Link
        key={item.href}
        className={`flex flex-col items-center justify-center rounded-2xl px-3 py-1 transition-all ${
          isActive
            ? "text-brand-green bg-emerald-50 dark:bg-emerald-900/20"
            : "text-slate-400 dark:text-slate-500"
        }`}
        href={item.href}
      >
        <span
          className="material-symbols-outlined text-2xl mb-0.5"
          style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
        >
          {item.icon}
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <div className="antialiased min-h-screen pb-24 md:pb-0 md:pl-64 flex flex-col">
      {/* SideNavBar (Web) */}
      <nav className="bg-white dark:bg-slate-900 font-body text-sm font-medium w-64 border-r border-black/5 dark:border-white/5 shadow-none flex-col gap-1 p-4 fixed left-0 top-0 h-full hidden md:flex z-50">
        <div className="flex items-center gap-3 px-4 py-6 mb-4">
          <span className="material-symbols-outlined text-brand-green" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-white leading-tight">StudyOS</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-0.5">পড়ার সিস্টেম</div>
          </div>
        </div>
        
        <div className="flex-1 space-y-1">{primaryNavItems.map(renderSidebarLink)}</div>
        
      </nav>

      {/* TopNavBar */}
      <header className="bg-white/80 dark:bg-slate-950/80 backdrop-blur-md font-body text-[15px] font-medium tracking-tight sticky top-0 z-40 border-b border-black/5 dark:border-white/5 shadow-none flex justify-between items-center w-full px-6 h-16 hidden md:flex">
        <Breadcrumbs />
        <div className="flex items-center gap-6">
          <span className="text-sm text-slate-500">{currentDate}</span>
          <div className="flex items-center gap-3 text-slate-500">
            <button className="hover:text-brand-green transition-colors duration-200 opacity-90 hover:opacity-100"><span className="material-symbols-outlined">local_fire_department</span></button>
            <button 
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="hover:text-brand-green transition-colors duration-200 opacity-90 hover:opacity-100"
            >
              <span className="material-symbols-outlined">
                {mounted && resolvedTheme === "dark" ? "light_mode" : "dark_mode"}
              </span>
            </button>
            <button className="hover:text-brand-green transition-colors duration-200 opacity-90 hover:opacity-100"><span className="material-symbols-outlined">notifications</span></button>
          </div>
          <UserButton />
        </div>
      </header>

      {/* Mobile Sticky Header */}
      <header className="md:hidden sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 h-16 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-brand-green transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
          <div className="flex flex-col">
            <span className="text-sm font-black text-slate-900 dark:text-white leading-none">StudyOS</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{currentDate}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-brand-green transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">
              {mounted && resolvedTheme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>
          <div className="ml-1">
            <UserButton />
          </div>
        </div>
      </header>

      {/* Slide-out Mobile Menu (Overlay) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-300" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 ease-out">
            <div className="flex items-center justify-between px-6 py-6 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-brand-green" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">StudyOS</span>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {primaryNavItems.slice(0, -1).map(renderMobileMenuLink)}
              <div className="h-px bg-black/5 dark:border-white/5 my-2 mx-4" />
              {renderMobileMenuLink(primaryNavItems[primaryNavItems.length - 1])}
            </div>
            
          </div>
        </div>
      )}

      {/* Main Content Canvas */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 py-6 md:px-6 md:py-section-y-sm">
        {children}
      </main>

      {/* BottomNavBar (Mobile) */}
      <nav className="bg-white dark:bg-slate-950 font-body text-[10px] font-medium md:hidden border-t border-black/5 dark:border-white/5 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-2 pb-safe">
        {bottomNavItems.map(renderBottomNavLink)}
      </nav>
    </div>
  );
}
