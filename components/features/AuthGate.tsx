"use client";

import { SignInButton, SignOutButton, UserButton } from "@clerk/nextjs";
import type { FunctionReference } from "convex/server";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
  useMutation,
} from "convex/react";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import NavigationLayout from "@/components/features/NavigationLayout";

type BootstrapState =
  | "idle"
  | "bootstrapping"
  | "ready"
  | "unauthorized"
  | "error";

type EnsureCurrentUserResult = {
  role: "owner" | "viewer";
};

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

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const ensureCurrentUser =
    useMutation(
      "auth:ensureCurrentUser" as unknown as FunctionReference<"mutation">,
    ) as () => Promise<EnsureCurrentUserResult>;
  const [bootstrapState, setBootstrapState] =
    useState<BootstrapState>("idle");

  const bootstrapUser = useEffectEvent(async () => {
    startTransition(() => {
      setBootstrapState("bootstrapping");
    });

    try {
      const user = await ensureCurrentUser();

      startTransition(() => {
        setBootstrapState(user.role === "owner" ? "ready" : "unauthorized");
      });
    } catch {
      startTransition(() => {
        setBootstrapState("error");
      });
    }
  });

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
        {bootstrapState === "ready" ? (
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
            ) : bootstrapState === "unauthorized" ? (
              <div className="space-y-5">
                <div className="flex justify-center">
                  <UserButton />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">
                    Access blocked
                  </p>
                  <h1 className="text-2xl font-bold">
                    এই অ্যাকাউন্টে অনুমতি নেই
                  </h1>
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                    এই Gontobbo workspace শুধু owner account-এর জন্য খোলা আছে।
                  </p>
                </div>
                <SignOutButton>
                  <button className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                    অন্য অ্যাকাউন্টে সাইন ইন করুন
                  </button>
                </SignOutButton>
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
