import Skeleton from "@/components/ui/Skeleton";
import type { ReactNode } from "react";

function SurfaceCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[28px] border border-border-subtle bg-white p-5 shadow-[0_14px_40px_rgba(0,0,0,0.03)] ${className}`}>
      {children}
    </div>
  );
}

function HeaderLines({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className={compact ? "h-7 w-40" : "h-9 w-56"} />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  );
}

function MetricGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <SurfaceCard key={index} className="rounded-2xl">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-14" />
            </div>
            <Skeleton className="h-12 w-12 rounded-2xl" />
          </div>
        </SurfaceCard>
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <SurfaceCard className="overflow-hidden rounded-2xl p-0">
      <div className="hidden min-w-[720px] md:block">
        <div
          className="grid border-b border-border-subtle px-5 py-4"
          style={{ gridTemplateColumns: `1.7fr repeat(${columns - 1}, minmax(88px, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-16" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid items-center border-b border-border-subtle px-5 py-4 last:border-b-0"
            style={{ gridTemplateColumns: `1.7fr repeat(${columns - 1}, minmax(88px, 1fr))` }}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-4 w-40" />
            </div>
            {Array.from({ length: columns - 1 }).map((_, index) => (
              <Skeleton key={index} className="mx-auto h-5 w-14" />
            ))}
          </div>
        ))}
      </div>
      <div className="space-y-3 p-4 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[24px] border border-border-subtle p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Skeleton className="h-12 rounded-2xl" />
              <Skeleton className="h-12 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

export function AuthLoadingSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="mx-auto h-14 w-14 rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="mx-auto h-6 w-48" />
        <Skeleton className="mx-auto h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-11 w-full rounded-full" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <SurfaceCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <HeaderLines compact />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Skeleton className="h-24 rounded-[22px]" />
          <Skeleton className="h-24 rounded-[22px]" />
          <Skeleton className="h-24 rounded-[22px]" />
        </div>
      </SurfaceCard>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <SurfaceCard key={index}>
            <HeaderLines compact />
            <div className="mt-6 space-y-4">
              <Skeleton className="h-36 rounded-[24px]" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </SurfaceCard>
        ))}
      </div>
    </div>
  );
}

export function SubjectsSkeleton() {
  return (
    <div className="w-full">
      <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <HeaderLines />
        <Skeleton className="h-11 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-gap-component md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <SurfaceCard key={index} className="rounded-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-2xl" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
            <div className="my-5 grid grid-cols-2 gap-4 border-y border-border-subtle py-4">
              <Skeleton className="h-14 rounded-2xl" />
              <Skeleton className="h-14 rounded-2xl" />
            </div>
            <Skeleton className="h-3 w-full" />
          </SurfaceCard>
        ))}
      </div>
    </div>
  );
}

export function SubjectDetailSkeleton() {
  return (
    <div className="w-full">
      <SurfaceCard className="mb-6 flex flex-col gap-5 md:mb-10 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-10 w-56" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </SurfaceCard>
      <div className="mb-8 flex md:justify-end">
        <Skeleton className="h-11 w-full sm:w-40" />
      </div>
      <div className="space-y-10">
        <div>
          <Skeleton className="mb-6 h-7 w-44" />
          <TableSkeleton rows={4} columns={6} />
        </div>
        <div>
          <Skeleton className="mb-6 h-7 w-40" />
          <TableSkeleton rows={5} columns={6} />
        </div>
      </div>
    </div>
  );
}

export function ChapterDetailSkeleton() {
  return (
    <div className="w-full">
      <SurfaceCard className="mb-6 flex flex-col gap-5 md:mb-10 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-10 w-64" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </SurfaceCard>
      <Skeleton className="mb-6 h-7 w-36" />
      <TableSkeleton rows={6} columns={5} />
      <Skeleton className="mx-auto mt-8 h-11 w-full sm:w-40" />
    </div>
  );
}

export function TodoSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <SurfaceCard className="mb-6 rounded-[36px]">
        <div className="flex items-end justify-between gap-4">
          <HeaderLines compact />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-2xl" />
          ))}
        </div>
      </SurfaceCard>
      <div className="space-y-4">
        <SurfaceCard className="rounded-[28px]">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-10 w-28" />
          </div>
        </SurfaceCard>
        {Array.from({ length: 4 }).map((_, index) => (
          <SurfaceCard key={index} className="rounded-3xl">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </SurfaceCard>
        ))}
      </div>
    </div>
  );
}

export function PlannerSkeleton() {
  return (
    <div className="space-y-8">
      <SurfaceCard className="rounded-[36px] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <HeaderLines />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-2xl" />
          ))}
        </div>
      </SurfaceCard>
      <section className="grid items-start gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <SurfaceCard className="rounded-[32px]">
          <HeaderLines compact />
          <div className="mt-6 space-y-5">
            <Skeleton className="h-12 rounded-full" />
            <Skeleton className="h-32 rounded-[24px]" />
            <Skeleton className="h-12 rounded-full" />
          </div>
        </SurfaceCard>
        <SurfaceCard className="rounded-[32px]">
          <div className="flex items-start justify-between border-b border-border-subtle pb-4">
            <HeaderLines compact />
            <Skeleton className="h-7 w-20" />
          </div>
          <div className="mt-4 space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-[28px]" />
            ))}
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}

export function RevisionSkeleton() {
  return (
    <div className="w-full">
      <div className="mb-10">
        <HeaderLines />
      </div>
      <div className="space-y-10">
        <MetricGrid />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-28 shrink-0" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SurfaceCard key={index} className="rounded-2xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-10 w-36" />
                </div>
              </div>
            </SurfaceCard>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LogsSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <HeaderLines />
        <Skeleton className="h-10 w-36" />
      </div>
      <SurfaceCard className="rounded-3xl">
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-40" />
        </div>
      </SurfaceCard>
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <SurfaceCard key={index} className="rounded-3xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-6 w-64 max-w-full" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-12 w-44 rounded-2xl" />
            </div>
          </SurfaceCard>
        ))}
      </div>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <SurfaceCard className="rounded-[32px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <HeaderLines compact />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-12 w-20 rounded-2xl" />
            <Skeleton className="h-12 w-20 rounded-2xl" />
            <Skeleton className="h-12 w-20 rounded-2xl" />
          </div>
        </div>
      </SurfaceCard>
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="hidden rounded-2xl border border-border-subtle bg-white p-3 lg:block">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="mb-2 h-12 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <SurfaceCard key={index} className="rounded-2xl">
              <Skeleton className="h-5 w-40" />
              <div className="mt-4 space-y-3">
                <Skeleton className="h-12 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
              </div>
            </SurfaceCard>
          ))}
        </div>
      </div>
    </div>
  );
}
