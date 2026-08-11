import Skeleton from "@/components/ui/Skeleton";

export default function StudyTargetLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6" aria-hidden="true">
      <Skeleton className="h-10 w-52 rounded-full" />
      <Skeleton className="h-44 w-full rounded-[28px]" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-[24px]" />
        <Skeleton className="h-28 rounded-[24px]" />
        <Skeleton className="h-28 rounded-[24px]" />
      </div>
      <Skeleton className="h-72 w-full rounded-[28px]" />
    </div>
  );
}
