"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PlannerSkeleton } from "./LoadingSkeletons";
import { getSubjectTheme } from "./subjectTheme";

export default function PlannerSettings() {
  const data = useQuery(api.plannerQueries.getPlannerSettingsData);
  const setPlannerSubjectPriority = useMutation(
    api.mutations.setPlannerSubjectPriority,
  );
  const setCoachingChapterProgress = useMutation(
    api.mutations.setCoachingChapterProgress,
  );
  const addWeeklyTarget = useMutation(api.mutations.addWeeklyTarget);
  const removeWeeklyTarget = useMutation(api.mutations.removeWeeklyTarget);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (data === undefined) {
    return <PlannerSkeleton />;
  }

  const handleToggleSubjectPriority = async (
    subjectId: string,
    currentPriority: "normal" | "important",
  ) => {
    setErrorMessage(null);

    try {
      await setPlannerSubjectPriority({
        subjectId: subjectId as Id<"subjects">,
        priority: currentPriority === "important" ? "normal" : "important",
      });
    } catch (error) {
      console.error("Failed to update planner subject priority:", error);
      setErrorMessage("গুরুত্বপূর্ণ বিষয় সেট করা যায়নি।");
    }
  };

  const handleChapterTargetToggle = async (chapter: {
    _id: string;
    isWeeklyTarget: boolean;
    weeklyTargetId: string | null;
  }) => {
    setErrorMessage(null);

    try {
      if (chapter.isWeeklyTarget && chapter.weeklyTargetId) {
        await removeWeeklyTarget({
          weeklyTargetId: chapter.weeklyTargetId as Id<"weeklyTargets">,
        });
      } else {
        await addWeeklyTarget({
          kind: "chapter",
          chapterId: chapter._id as Id<"chapters">,
        });
      }
    } catch (error) {
      console.error("Failed to toggle chapter weekly target:", error);
      setErrorMessage("চ্যাপ্টার টার্গেট আপডেট করা যায়নি।");
    }
  };

  const handleConceptTargetToggle = async (chapterId: string, concept: {
    _id: string;
    isWeeklyTarget: boolean;
    weeklyTargetId: string | null;
  }) => {
    setErrorMessage(null);

    try {
      if (concept.isWeeklyTarget && concept.weeklyTargetId) {
        await removeWeeklyTarget({
          weeklyTargetId: concept.weeklyTargetId as Id<"weeklyTargets">,
        });
      } else {
        await addWeeklyTarget({
          kind: "concept",
          chapterId: chapterId as Id<"chapters">,
          conceptId: concept._id as Id<"concepts">,
        });
      }
    } catch (error) {
      console.error("Failed to toggle concept weekly target:", error);
      setErrorMessage("কনসেপ্ট টার্গেট আপডেট করা যায়নি।");
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-border-subtle bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.04)] md:p-8">
        <p className="font-mono-code text-[11px] uppercase tracking-[0.18em] text-brand-green">
          Planner Settings
        </p>
        <h1 className="mt-3 font-section-heading text-[2rem] leading-tight tracking-[-0.04em] text-on-surface md:text-section-heading">
          প্ল্যানারের অগ্রাধিকার ঠিক করুন
        </h1>
        <p className="mt-3 max-w-3xl font-body text-sm text-gray-500 md:text-base">
          গুরুত্বপূর্ণ বিষয়, সাপ্তাহিক টার্গেট আর স্কুল/কোচিং অগ্রগতি ঠিক করলে
          AI Planner আরও ভালো সাজেশন দিতে পারবে।
        </p>

        {errorMessage ? (
          <div className="mt-5 rounded-[20px] border border-[#f1c2bc] bg-[#fff4f2] px-4 py-3 text-sm text-[#c54f41]">
            {errorMessage}
          </div>
        ) : null}
      </section>

      <div className="space-y-6">
        {data.map((subject) => (
          <section
            key={subject._id}
            className="rounded-[32px] border border-border-subtle bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.04)]"
          >
            <div className="flex flex-col gap-4 border-b border-border-subtle pb-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full ${getSubjectTheme(subject.color).iconBg} ${getSubjectTheme(subject.color).iconColor}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {subject.icon ?? "menu_book"}
                    </span>
                  </span>
                  <div>
                    <h2 className="font-card-title text-xl text-on-surface">
                      {subject.name}
                    </h2>
                    <p className="mt-1 font-body text-sm text-gray-500">
                      পরবর্তী পরীক্ষার চ্যাপ্টার এবং টার্গেট
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void handleToggleSubjectPriority(subject._id, subject.priority)
                }
                className={`rounded-full px-5 py-2.5 font-label-uppercase text-label-uppercase transition-all ${
                  subject.priority === "important"
                    ? "bg-on-surface text-pure-white"
                    : "border border-border-subtle text-gray-600 hover:bg-gray-100"
                }`}
              >
                {subject.priority === "important"
                  ? "Important Subject"
                  : "Mark Important"}
              </button>
            </div>

            <div className="mt-6 space-y-5">
              {subject.chapters.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border-medium bg-surface-container px-5 py-8 text-center text-sm text-gray-500">
                  এই বিষয়ের পরবর্তী টার্মের চ্যাপ্টার এখনো সেট করা হয়নি।
                </div>
              ) : (
                subject.chapters.map((chapter) => (
                  <div
                    key={chapter._id}
                    className="rounded-[28px] border border-border-subtle bg-surface-container px-5 py-5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-mono-code uppercase tracking-[0.14em] text-gray-500">
                            {chapter.coachingStatus === "running"
                              ? "Coaching Running"
                              : chapter.coachingStatus === "finished"
                                ? "Coaching Finished"
                                : "Not Started"}
                          </span>
                          {chapter.isWeeklyTarget ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-mono-code uppercase tracking-[0.14em] text-brand-green">
                              {chapter.isTargetComplete
                                ? "Target Complete"
                                : "Weekly Target"}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 font-sub-heading text-lg text-on-surface">
                          {chapter.name}
                        </h3>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <select
                          value={chapter.coachingStatus}
                          onChange={(event) =>
                            void setCoachingChapterProgress({
                              chapterId: chapter._id as Id<"chapters">,
                              status: event.target.value as
                                | "not_started"
                                | "running"
                                | "finished",
                            }).catch((error) => {
                              console.error(
                                "Failed to update coaching progress:",
                                error,
                              );
                              setErrorMessage("কোচিং অগ্রগতি আপডেট করা যায়নি।");
                            })
                          }
                          className="rounded-full border border-border-medium bg-white px-4 py-2.5 text-sm text-on-surface outline-none transition-all focus:border-brand-green"
                        >
                          <option value="not_started">Not started</option>
                          <option value="running">Running</option>
                          <option value="finished">Finished</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => void handleChapterTargetToggle(chapter)}
                          className={`rounded-full px-4 py-2.5 text-sm transition-all ${
                            chapter.isWeeklyTarget
                              ? "bg-on-surface text-pure-white"
                              : "border border-border-subtle bg-white text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {chapter.isWeeklyTarget ? "Remove Target" : "Target Chapter"}
                        </button>
                      </div>
                    </div>

                    {chapter.concepts.length > 0 ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {chapter.concepts.map((concept) => (
                          <button
                            type="button"
                            key={concept._id}
                            onClick={() =>
                              void handleConceptTargetToggle(chapter._id, concept)
                            }
                            className={`rounded-full px-3.5 py-2 text-sm transition-all ${
                              concept.isWeeklyTarget
                                ? concept.isTargetComplete
                                  ? "bg-emerald-50 text-brand-green"
                                  : "bg-on-surface text-pure-white"
                                : "border border-border-subtle bg-white text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {concept.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
