"use client";

import React, { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

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
  const [editableOnly, setEditableOnly] = useState(false);

  // Queries
  const subjects = useQuery(api.queries.getStudyLogSubjectsFilterData);
  const { results: logs, status, loadMore } = usePaginatedQuery(
    api.queries.getStudyLogsFeed,
    {
      subjectId,
      eventType: eventType as StudyLogEventType,
      editableOnly,
    },
    { initialNumItems: 50 }
  );

  // Mutations
  const updateMinutes = useMutation(api.mutations.updateStudyLogMinutes);

  // Inline editing state
  const [editingLogId, setEditingLogId] = useState<Id<"studyLogs"> | null>(null);
  const [editMinutes, setEditMinutes] = useState<number>(0);

  if (!logs) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="w-10 h-10 border-4 border-brand-green/20 border-t-brand-green rounded-full animate-spin"></div>
      <div className="text-slate-500 animate-pulse font-medium">লোডিং হচ্ছে...</div>
    </div>
  );

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
            onChange={(e) => setEventType(e.target.value || undefined)}
            className="bg-transparent text-sm outline-none border-none pr-4 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
          >
            <option value="">সব ধরণ</option>
            <option value="study_item_completed">পড়া শেষ</option>
            <option value="concept_review">রিভিশন</option>
            <option value="study_item_uncompleted">পড়া অসম্পূর্ণ</option>
          </select>
        </div>

        <button 
          onClick={() => setEditableOnly(!editableOnly)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
            editableOnly 
            ? "bg-brand-green/10 border-brand-green/20 text-brand-green" 
            : "bg-slate-50 dark:bg-slate-800/50 border-black/5 dark:border-white/5 text-slate-500"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {editableOnly ? 'check_circle' : 'circle'}
          </span>
          শুধুমাত্র পরিবর্তনযোগ্য
        </button>
      </div>

      {/* Feed */}
      <div className="space-y-3">
        {logs.length === 0 && (
          <div className="p-20 text-center bg-white dark:bg-slate-900 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-5xl text-slate-200 dark:text-slate-700">history_edu</span>
            <div className="text-slate-400 font-medium">কোন লগ পাওয়া যায়নি</div>
          </div>
        )}

        {logs.map((log) => (
          <div 
            key={log._id} 
            className="bg-white dark:bg-slate-900 p-5 rounded-[32px] border border-black/5 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-brand-green/20 transition-all shadow-sm hover:shadow-md"
          >
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-[0.1em] px-2.5 py-1 rounded-full ${
                  log.eventType === 'concept_review' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20' : 
                  log.eventType === 'study_item_completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20' :
                  'bg-slate-100 text-slate-600 dark:bg-slate-800'
                }`}>
                  {EVENT_LABELS[log.eventType as keyof typeof EVENT_LABELS]}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {new Date(log.loggedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              
              <h3 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight">{log.titleSnapshot}</h3>
              
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
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

            <div className="flex items-center gap-4 pl-4 md:border-l border-slate-100 dark:border-slate-800">
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
                   <span className="text-[8px] font-black uppercase tracking-tighter text-slate-400 mt-0.5">{log.rating}</span>
                </div>
              )}

              <div className="text-right min-w-[180px]">
                {editingLogId === log._id ? (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-2xl justify-end">
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
                      className="bg-white dark:bg-slate-900 w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-end group/item">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end leading-none">
                        <span className="text-lg font-black text-slate-900 dark:text-white whitespace-nowrap">
                          {new Date(log.loggedAt - log.minutesSpent * 60 * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - {new Date(log.loggedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">সময়</span>
                      </div>
                      
                      {log.isEditable && (
                        <button 
                          onClick={() => {
                            setEditingLogId(log._id);
                            setEditMinutes(log.minutesSpent);
                          }}
                          className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full bg-brand-green/10 text-brand-green hover:bg-brand-green hover:text-white transition-all flex items-center justify-center"
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
