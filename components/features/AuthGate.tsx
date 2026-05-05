"use client";

import { SignInButton } from "@clerk/nextjs";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import NavigationLayout from "@/components/features/NavigationLayout";
import { api } from "@/convex/_generated/api";
import { AuthLoadingSkeleton } from "./LoadingSkeletons";

type BootstrapState = "idle" | "bootstrapping" | "ready" | "error";
type OnboardingClassLevel = "hsc" | "other";

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-[32px] border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
          {children}
        </div>
      </div>
    </main>
  );
}

function OnboardingClassPicker({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting: boolean;
  onSubmit: (classLevel: OnboardingClassLevel) => void;
}) {
  const [selectedClassLevel, setSelectedClassLevel] =
    useState<OnboardingClassLevel>("hsc");
  const options: Array<{
    value: OnboardingClassLevel;
    title: string;
    description: string;
    icon: string;
  }> = [
    {
      value: "hsc",
      title: "HSC",
      description: "বিজ্ঞান বিভাগের বিষয় ও অধ্যায় তৈরি হবে",
      icon: "school",
    },
    {
      value: "other",
      title: "অন্যান্য",
      description: "খালি ওয়ার্কস্পেস দিয়ে শুরু করুন",
      icon: "edit_note",
    },
  ];

  return (
    <CenteredMessage>
      <div className="space-y-6 text-left">
        <div className="space-y-3 text-center">
          <p className="font-mono-code text-[11px] uppercase tracking-[0.22em] text-emerald-600">
            প্রথম সেটআপ
          </p>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-50">
            তুমি কী দিয়ে শুরু করতে চাও?
          </h1>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            HSC বেছে নিলে প্রস্তুত সিলেবাস তৈরি হবে। অন্যান্য বেছে নিলে
            একদম খালি জায়গা থেকে নিজের বিষয় যোগ করতে পারবে।
          </p>
        </div>

        <div className="space-y-3">
          {options.map((option) => {
            const isSelected = selectedClassLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={isSubmitting}
                onClick={() => setSelectedClassLevel(option.value)}
                className={`flex w-full items-center gap-4 rounded-[28px] border p-5 text-left shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-500/10 hover:bg-emerald-100 dark:border-emerald-400/70 dark:bg-emerald-400/10"
                    : "border-black/5 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
                }`}
                aria-pressed={isSelected}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm dark:bg-slate-900 ${
                    isSelected
                      ? "bg-white text-emerald-600"
                      : "bg-slate-100 text-slate-500 dark:text-slate-300"
                  }`}
                >
                  <span className="material-symbols-outlined">
                    {option.icon}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-slate-950 dark:text-slate-50">
                    {option.title}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
                    {option.description}
                  </span>
                </span>
                <span
                  className={`material-symbols-outlined ${
                    isSelected ? "text-emerald-600" : "text-slate-300"
                  }`}
                >
                  {isSelected ? "check_circle" : "radio_button_unchecked"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onSubmit(selectedClassLevel)}
          className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? "সেটআপ হচ্ছে..."
            : selectedClassLevel === "hsc"
              ? "HSC দিয়ে শুরু করুন"
              : "অন্যান্য দিয়ে শুরু করুন"}
        </button>
      </div>
    </CenteredMessage>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const ensureCurrentUser = useMutation(api.auth.ensureCurrentUser);
  const selectClassAndSeedSyllabus = useMutation(
    api.onboarding.selectClassAndSeedSyllabus,
  );
  const [bootstrapState, setBootstrapState] =
    useState<BootstrapState>("idle");
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);
  const onboardingStatus = useQuery(
    api.onboarding.getOnboardingStatus,
    bootstrapState === "ready" ? {} : "skip",
  );

  const bootstrapUser = useEffectEvent(async () => {
    startTransition(() => {
      setBootstrapState("bootstrapping");
    });

    try {
      await ensureCurrentUser();

      startTransition(() => {
        setBootstrapState("ready");
      });
    } catch {
      startTransition(() => {
        setBootstrapState("error");
      });
    }
  });

  const completeOnboarding = async (classLevel: OnboardingClassLevel) => {
    startTransition(() => {
      setIsCompletingOnboarding(true);
    });

    try {
      await selectClassAndSeedSyllabus({ classLevel });
    } catch {
      startTransition(() => {
        setBootstrapState("error");
      });
    } finally {
      startTransition(() => {
        setIsCompletingOnboarding(false);
      });
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      startTransition(() => {
        setBootstrapState("idle");
      });
      return;
    }

    if (bootstrapState !== "idle") {
      return;
    }

    void bootstrapUser();
  }, [bootstrapState, isAuthenticated]);

  return (
    <>
      <AuthLoading>
        <CenteredMessage>
          <AuthLoadingSkeleton />
        </CenteredMessage>
      </AuthLoading>

      <Unauthenticated>
        <CenteredMessage>
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Gontobbo
            </p>
            <h1 className="text-3xl font-bold">
              আপনার স্টাডি সিস্টেমে ঢুকুন
            </h1>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              চালিয়ে যেতে আপনার অ্যাকাউন্টে সাইন ইন করুন।
            </p>
            <SignInButton mode="modal">
              <button className="inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600">
                সাইন ইন
              </button>
            </SignInButton>
          </div>
        </CenteredMessage>
      </Unauthenticated>

      <Authenticated>
        {bootstrapState === "ready" && onboardingStatus?.requiresOnboarding ? (
          <OnboardingClassPicker
            isSubmitting={isCompletingOnboarding}
            onSubmit={(classLevel) => {
              void completeOnboarding(classLevel);
            }}
          />
        ) : bootstrapState === "ready" && onboardingStatus !== undefined ? (
          <NavigationLayout>{children}</NavigationLayout>
        ) : (
          <CenteredMessage>
            {bootstrapState === "bootstrapping" || bootstrapState === "idle" ? (
              <AuthLoadingSkeleton />
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">
                  সমস্যা হয়েছে
                </p>
                <h1 className="text-2xl font-bold">
                  আপনার অ্যাকাউন্ট প্রস্তুত করা যায়নি
                </h1>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  সাইন ইন হয়েছে, কিন্তু অ্যাপ চালু করতে একটু সমস্যা হয়েছে।
                  আবার চেষ্টা করুন।
                </p>
                <button
                  className="inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  onClick={() => {
                    startTransition(() => {
                      setBootstrapState("idle");
                    });
                  }}
                  type="button"
                >
                  আবার চেষ্টা করুন
                </button>
              </div>
            )}
          </CenteredMessage>
        )}
      </Authenticated>
    </>
  );
}
