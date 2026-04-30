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

type BootstrapState =
  | "idle"
  | "bootstrapping"
  | "ready"
  | "error";

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
  onSelectHsc,
}: {
  isSubmitting: boolean;
  onSelectHsc: () => void;
}) {
  return (
    <CenteredMessage>
      <div className="space-y-6 text-left">
        <div className="space-y-3 text-center">
          <p className="font-mono-code text-[11px] uppercase tracking-[0.22em] text-emerald-600">
            প্রথম সেটআপ
          </p>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-50">
            তুমি কোন ক্লাসে পড়ো?
          </h1>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            আপাতত HSC সিলেবাস প্রস্তুত আছে। এটি বেছে নিলে বিষয় ও অধ্যায়গুলো
            তোমার জন্য তৈরি হয়ে যাবে।
          </p>
        </div>

        <button
          type="button"
          className="flex w-full items-center gap-4 rounded-[28px] border border-emerald-500 bg-emerald-50 p-5 text-left shadow-sm ring-4 ring-emerald-500/10 transition hover:bg-emerald-100 dark:border-emerald-400/70 dark:bg-emerald-400/10"
          aria-pressed="true"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm dark:bg-slate-900">
            <span className="material-symbols-outlined">school</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-slate-950 dark:text-slate-50">
              HSC
            </span>
            <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
              বিজ্ঞান বিভাগের বিষয় ও অধ্যায়
            </span>
          </span>
          <span className="material-symbols-outlined text-emerald-600">
            check_circle
          </span>
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSelectHsc}
          className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "সিলেবাস তৈরি হচ্ছে..." : "HSC দিয়ে শুরু করুন"}
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

  const completeHscOnboarding = async () => {
    startTransition(() => {
      setIsCompletingOnboarding(true);
    });

    try {
      await selectClassAndSeedSyllabus({ classLevel: "hsc" });
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
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Clerk + Convex
            </p>
            <h1 className="text-2xl font-bold">অথেনটিকেশন লোড হচ্ছে</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              আপনার সেশন যাচাই করা হচ্ছে।
            </p>
          </div>
        </CenteredMessage>
      </AuthLoading>

      <Unauthenticated>
        <CenteredMessage>
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Gontobbo
            </p>
            <h1 className="text-3xl font-bold">আপনার স্টাডি সিস্টেমে ঢুকুন</h1>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              এই অ্যাপটি এখন Clerk দিয়ে সুরক্ষিত। চালিয়ে যেতে সাইন ইন করুন।
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
            onSelectHsc={() => {
              void completeHscOnboarding();
            }}
          />
        ) : bootstrapState === "ready" && onboardingStatus !== undefined ? (
          <NavigationLayout>{children}</NavigationLayout>
        ) : (
          <CenteredMessage>
            {bootstrapState === "bootstrapping" || bootstrapState === "idle" ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">
                  প্রস্তুতি
                </p>
                <h1 className="text-2xl font-bold">
                  আপনার প্রোফাইল সেট করা হচ্ছে
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  প্রথমবার সাইন ইন হলে আমরা আপনার Convex user record তৈরি করি।
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">
                  Sync failed
                </p>
                <h1 className="text-2xl font-bold">
                  সেশন সেটআপ শেষ করা যায়নি
                </h1>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Clerk সাইন ইন হয়েছে, কিন্তু Convex user bootstrap ব্যর্থ হয়েছে।
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
