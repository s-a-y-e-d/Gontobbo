"use client";

import StudyLogFeed from "@/components/features/StudyLogFeed";

export default function LogsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">স্টাডি লগস</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-lg">আপনার পড়াশোনার ইতিহাস দেখুন এবং সময় সংশোধন করুন।</p>
        </div>
        
        <div className="flex items-center gap-2 bg-brand-green/10 text-brand-green px-4 py-2 rounded-2xl border border-brand-green/20 self-start md:self-auto">
          <span className="material-symbols-outlined text-[20px]">analytics</span>
          <span className="text-sm font-bold uppercase tracking-wider">Activity Feed</span>
        </div>
      </div>
      
      <StudyLogFeed />
    </div>
  );
}
