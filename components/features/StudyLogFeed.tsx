"use client";

import React, { useState, useMemo } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { LogsSkeleton } from "./LoadingSkeletons";
import { useSnapshotQuery } from "./useSnapshotQuery";

// Helper for event labels in Bengali
const EVENT_LABELS = {
  study_item_completed: "পড়া শেষ",
  study_item_uncompleted: "পড়া অসম্পূর্ণ",
  concept_review: "রিভিশন",
};

type StudyLogEventType = keyof typeof EVENT_LABELS;

export default function StudyLogFeed() {
  // Filter states
  const [subjectId, setSubjectId] = useState<Id<"subjects"> | undefined>();
  const [eventType, setEventType] = useState<StudyLogEventType | undefined>();

  // Queries
  const { data: subjects } = useSnapshotQuery(
    api.queries.getStudyLogSubjectsFilterData,
    {},
  );
  const { results: logs, status, loadMore } = usePaginatedQuery(
    api.queries.getStudyLogsFeed,
    {
      subjectId,
      eventType: eventType as StudyLogEventType,
    },
    { initialNumItems: 50 }
  );

  // Group logs by day
  const groupedLogs = useMemo(() => {
    if (!logs) return [];
    return logs.reduce((acc: { date: string; items: typeof logs }[], log) => {
      const date = new Date(log.loggedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const lastGroup = acc[acc.length - 1];
      if (lastGroup && lastGroup.date === date) {
        lastGroup.items.push(log);
      } else {
        acc.push({ date, items: [log] });
      }
      return acc;
    }, []);
  }, [logs]);

  // Mutations
  const updateMinutes = useMutation(api.mutations.updateStudyLogMinutes);

  // Inline editing state
  const [editingLogId, setEditingLogId] = useState<Id<"studyLogs"> | null>(null);
  const [editMinutes, setEditMinutes] = useState<number>(0);

  if (!logs) return <LogsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-4 items-center bg-white dark:bg-slate-900 p-4 rounded-3xl border border-black/5 dark:border-white/5 shadow-sm">
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-4 py-2 rounded-full border border-black/5 dark:border-white/5">
          <span className="material-symbols-outlined text-sm text-slate-400">filter_list</span>
          <select 
            value={subjectId || ""} 
            onChange={(e) => setSubjectId(e.target.value ? (e.target.value as Id<"subjects">) : undefined)}
            className="bg-transparent text-sm outline-none border-none pr-4 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
          >
            <option value="">সব বিষয়</option>
            {subjects?.map(s => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-4 py-2 rounded-full border border-black/5 dark:border-white/5">
          <span className="material-symbols-outlined text-sm text-slate-400">category</span>
          <select 
            value={eventType || ""} 
            onChange={(e) => setEventType((e.target.value as "study_item_completed" | "study_item_uncompleted" | "concept_review") || undefined)}
            className="bg-transparent text-sm outline-none border-none pr-4 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
          >
            <option value="">সব ধরণ</option>
            <option value="study_item_completed">পড়া শেষ</option>
            <option value="concept_review">রিভিশন</option>
            <option value="study_item_uncompleted">পড়া অসম্পূর্ণ</option>
          </select>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-10">
        {logs.length === 0 && (
          <div className="p-20 text-center bg-white dark:bg-slate-900 rounded-[32px] border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-5xl text-slate-200 dark:text-slate-700">history_edu</span>
            <div className="text-slate-400 font-medium">কোন লগ পাওয়া যায়নি</div>
          </div>
        )}

        {groupedLogs.map((group) => (
          <div key={group.date} className="space-y-6">
            {/* Date Header */}
            <div className="sticky top-0 z-10 py-2 -mx-4 px-4 flex items-center gap-4">
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-1.5 rounded-full border border-black/5 dark:border-white/5 shadow-sm">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {group.date}
                </span>
              </div>
              <div className="h-[1px] flex-1 bg-slate-100 dark:bg-slate-800/50"></div>
            </div>

            <div className="space-y-4 pl-2 md:pl-0 border-l-2 border-slate-100 dark:border-slate-800/50 md:border-l-0 ml-2 md:ml-0">
              {group.items.map((log) => (
                <div 
                  key={log._id} 
                  className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-3xl border border-black/5 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-brand-green/20 transition-all shadow-sm hover:shadow-md relative"
                >
                  {/* Timeline dot (mobile only) */}
                  <div className="absolute -left-[11px] top-7 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 md:hidden z-10 flex items-center justify-center shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-green"></div>
                  </div>

                  <div className="flex-1 space-y-3 md:space-y-1.5">
                    {/* Mobile View: Metadata Rows */}
                    <div className="flex flex-col space-y-3 md:hidden">
                      {/* Row 1: Event Label & Rating/Edit */}
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-black uppercase tracking-[0.1em] px-2.5 py-1 rounded-full ${
                          log.eventType === 'concept_review' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20' : 
                          log.eventType === 'study_item_completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800'
                        }`}>
                          {EVENT_LABELS[log.eventType as keyof typeof EVENT_LABELS]}
                        </span>

                        <div className="flex items-center gap-2">
                          {log.rating && (
                            <span className={`material-symbols-outlined text-[20px] ${
                              log.rating === 'easy' ? 'text-emerald-500' :
                              log.rating === 'medium' ? 'text-amber-500' :
                              'text-rose-500'
                            }`} style={{ fontVariationSettings: "'FILL' 1" }}>
                              {log.rating === 'easy' ? 'sentiment_satisfied' :
                               log.rating === 'medium' ? 'sentiment_neutral' :
                               'sentiment_dissatisfied'}
                            </span>
                          )}
                          {log.isEditable && editingLogId !== log._id && (
                            <button 
                              onClick={() => {
                                setEditingLogId(log._id);
                                setEditMinutes(log.minutesSpent);
                              }}
                              className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 flex items-center justify-center border border-black/5 dark:border-white/5"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight leading-tight">{log.titleSnapshot}</h3>

                      {/* Time & Tags */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                          <span className="material-symbols-outlined text-[18px] text-slate-400">schedule</span>
                          {new Date(log.loggedAt - log.minutesSpent * 60 * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - {new Date(log.loggedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                          <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-brand-green">book</span>
                            {log.subjectNameSnapshot}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-brand-green">folder</span>
                            {log.chapterNameSnapshot}
                          </span>
                        </div>
                      </div>

                      {/* Inline Editing for Mobile */}
                      {editingLogId === log._id && (
                        <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-2xl border border-black/5 dark:border-white/5">
                            <span className="text-xs font-black uppercase text-slate-400 pl-2">Minutes</span>
                            <input 
                              type="number" 
                              value={editMinutes}
                              onChange={(e) => setEditMinutes(parseInt(e.target.value) || 0)}
                              className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-sm font-bold text-center outline-none focus:border-brand-green"
                              autoFocus
                            />
                            <div className="flex gap-1 ml-auto">
                              <button 
                                onClick={async () => {
                                  await updateMinutes({ logId: log._id, minutesSpent: editMinutes });
                                  setEditingLogId(null);
                                }}
                                className="bg-brand-green text-white w-9 h-9 rounded-full flex items-center justify-center shadow-lg shadow-brand-green/20"
                              >
                                <span className="material-symbols-outlined text-[20px]">check</span>
                              </button>
                              <button 
                                onClick={() => setEditingLogId(null)}
                                className="bg-white dark:bg-slate-900 w-9 h-9 rounded-full text-slate-400 flex items-center justify-center border border-black/5 dark:border-white/5"
                              >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Desktop View: Metadata Header (Hidden on Mobile) */}
                    <div className="hidden md:flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-[0.1em] px-2.5 py-1 rounded-full ${
                        log.eventType === 'concept_review' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20' : 
                        log.eventType === 'study_item_completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800'
                      }`}>
                        {EVENT_LABELS[log.eventType as keyof typeof EVENT_LABELS]}
                      </span>
                    </div>
                    
                    <h3 className="hidden md:block font-bold text-slate-900 dark:text-white text-lg tracking-tight">{log.titleSnapshot}</h3>
                    
                    {/* Desktop View: Tags Footer (Hidden on Mobile) */}
                    <div className="hidden md:flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                      <span className="flex items-center gap-1.5 opacity-80">
                        <span className="material-symbols-outlined text-[16px] text-brand-green">book</span>
                        {log.subjectNameSnapshot}
                      </span>
                      <span className="flex items-center gap-1.5 opacity-80">
                        <span className="material-symbols-outlined text-[16px] text-brand-green">folder</span>
                        {log.chapterNameSnapshot}
                      </span>
                    </div>
                  </div>

                  {/* Rating & Editing (Desktop only) */}
                  <div className="hidden md:flex items-center gap-4 pl-4 border-l border-slate-100 dark:border-slate-800">
                    {log.rating && (
                      <div className="flex flex-col items-center justify-center min-w-[48px] h-12 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-black/5 dark:border-white/5">
                         <span className={`material-symbols-outlined text-2xl ${
                           log.rating === 'easy' ? 'text-emerald-500' :
                           log.rating === 'medium' ? 'text-amber-500' :
                           'text-rose-500'
                         }`} style={{ fontVariationSettings: "'FILL' 1" }}>
                           {log.rating === 'easy' ? 'sentiment_satisfied' :
                            log.rating === 'medium' ? 'sentiment_neutral' :
                            'sentiment_dissatisfied'}
                         </span>
                         <span className="hidden md:block text-[8px] font-black uppercase tracking-tighter text-slate-400 mt-0.5">{log.rating}</span>
                      </div>
                    )}

                    <div className="text-right min-w-0 md:min-w-[180px]">
                      {editingLogId === log._id ? (
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-2xl justify-end border border-black/5 dark:border-white/5">
                          <input 
                            type="number" 
                            value={editMinutes}
                            onChange={(e) => setEditMinutes(parseInt(e.target.value) || 0)}
                            className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-sm font-bold text-center outline-none focus:border-brand-green"
                            autoFocus
                          />
                          <button 
                            onClick={async () => {
                              await updateMinutes({ logId: log._id, minutesSpent: editMinutes });
                              setEditingLogId(null);
                            }}
                            className="bg-brand-green text-white w-8 h-8 rounded-full hover:opacity-90 transition-opacity flex items-center justify-center shadow-lg shadow-brand-green/20"
                          >
                            <span className="material-symbols-outlined text-[18px]">check</span>
                          </button>
                          <button 
                            onClick={() => setEditingLogId(null)}
                            className="bg-white dark:bg-slate-900 w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors border border-black/5 dark:border-white/5"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end group/item">
                          <div className="flex items-center gap-2">
                            <div className="hidden md:flex flex-col items-end leading-none">
                              <span className="text-lg font-black text-slate-900 dark:text-white whitespace-nowrap">
                                {new Date(log.loggedAt - log.minutesSpent * 60 * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - {new Date(log.loggedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </span>
                            </div>
                            
                            {log.isEditable && (
                              <button 
                                onClick={() => {
                                  setEditingLogId(log._id);
                                  setEditMinutes(log.minutesSpent);
                                }}
                                className="md:opacity-0 md:group-hover:opacity-100 w-8 h-8 rounded-full bg-brand-green/10 text-brand-green hover:bg-brand-green hover:text-white transition-all flex items-center justify-center"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {status === "CanLoadMore" && (
          <div className="pt-6 flex justify-center">
            <button 
              onClick={() => loadMore(50)}
              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold px-8 py-3 rounded-full border border-black/5 dark:border-white/5 hover:border-brand-green/30 transition-all active:scale-95 shadow-sm"
            >
              আরো দেখুন
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
