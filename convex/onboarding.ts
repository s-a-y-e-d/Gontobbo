import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  filterOwnedDocuments,
  isLegacyWorkspaceOwner,
  requireCurrentUser,
  type CurrentUser,
} from "./auth";

type TrackerConfig = {
  key: string;
  label: string;
  avgMinutes: number;
};

type HscSubjectSeed = {
  name: string;
  slug: string;
  icon: string;
  color: string;
  order: number;
  chapters: string[];
};

const HSC_CHAPTER_TRACKERS: TrackerConfig[] = [
  { key: "mcq", label: "MCQ", avgMinutes: 30 },
  { key: "board", label: "বোর্ড", avgMinutes: 45 },
];

const HSC_CONCEPT_TRACKERS: TrackerConfig[] = [
  { key: "class", label: "ক্লাস", avgMinutes: 20 },
  { key: "book", label: "বই", avgMinutes: 25 },
];

const HSC_SUBJECTS: HscSubjectSeed[] = [
  {
    name: "পদার্থবিজ্ঞান প্রথম পত্র",
    slug: "physics-1",
    icon: "rocket_launch",
    color: "blue",
    order: 1,
    chapters: [
      "ভৌত জগৎ ও পরিমাপ",
      "ভেক্টর",
      "গতিবিদ্যা",
      "নিউটনীয় বলবিদ্যা",
      "কাজ, শক্তি ও ক্ষমতা",
      "মহাকর্ষ ও অভিকর্ষ",
      "পদার্থের গাঠনিক ধর্ম",
      "পর্যাবৃত্ত গতি",
      "তরঙ্গ",
      "আদর্শ গ্যাস ও গ্যাসের গতিতত্ত্ব",
    ],
  },
  {
    name: "পদার্থবিজ্ঞান দ্বিতীয় পত্র",
    slug: "physics-2",
    icon: "rocket_launch",
    color: "indigo",
    order: 2,
    chapters: [
      "তাপগতিবিদ্যা",
      "স্থির তড়িৎ",
      "চল তড়িৎ",
      "তড়িৎ প্রবাহের চৌম্বক ক্রিয়া ও চৌম্বকত্ব",
      "তাড়িতচৌম্বক আবেশ ও পরিবর্তী প্রবাহ",
      "জ্যামিতিক আলোকবিজ্ঞান",
      "ভৌত আলোকবিজ্ঞান",
      "আধুনিক পদার্থবিজ্ঞানের সূচনা",
      "পরমাণুর মডেল ও নিউক্লিয়ার পদার্থবিজ্ঞান",
      "সেমিকন্ডাক্টর ও ইলেকট্রনিক্স",
      "জ্যোতির্বিজ্ঞান",
    ],
  },
  {
    name: "রসায়ন প্রথম পত্র",
    slug: "chemistry-1",
    icon: "science",
    color: "green",
    order: 3,
    chapters: [
      "ল্যাবরেটরির নিরাপদ ব্যবহার",
      "গুণগত রসায়ন",
      "মৌলের পর্যায়বৃত্ত ধর্ম ও রাসায়নিক বন্ধন",
      "রাসায়নিক পরিবর্তন",
      "কর্মমুখী রসায়ন",
    ],
  },
  {
    name: "রসায়ন দ্বিতীয় পত্র",
    slug: "chemistry-2",
    icon: "science",
    color: "teal",
    order: 4,
    chapters: [
      "পরিবেশ রসায়ন",
      "জৈব রসায়ন",
      "পরিমাণগত রসায়ন",
      "তড়িৎ রসায়ন",
      "অর্থনৈতিক রসায়ন",
    ],
  },
  {
    name: "জীববিজ্ঞান প্রথম পত্র",
    slug: "biology-1",
    icon: "biotech",
    color: "pink",
    order: 5,
    chapters: [
      "কোষ ও এর গঠন",
      "কোষ বিভাজন",
      "কোষ রসায়ন",
      "অণুজীব",
      "শৈবাল ও ছত্রাক",
      "ব্রায়োফাইটা ও টেরিডোফাইটা",
      "নগ্নবীজী ও আবৃতবীজী উদ্ভিদ",
      "টিস্যু ও টিস্যুতন্ত্র",
      "উদ্ভিদ শারীরতত্ত্ব",
      "উদ্ভিদ প্রজনন",
      "জীবপ্রযুক্তি",
      "জীবের পরিবেশ, বিস্তার ও সংরক্ষণ",
    ],
  },
  {
    name: "জীববিজ্ঞান দ্বিতীয় পত্র",
    slug: "biology-2",
    icon: "biotech",
    color: "red",
    order: 6,
    chapters: [
      "প্রাণীর বিভিন্নতা ও শ্রেণিবিন্যাস",
      "প্রাণীর পরিচিতি (হাইড্রা, ঘাসফড়িং, রুই মাছ)",
      "পরিপাক ও শোষণ",
      "রক্ত ও সংবহন",
      "শ্বসন ও শ্বাসক্রিয়া",
      "বর্জ্য ও নিষ্কাশন",
      "চলন ও অঙ্গচালনা",
      "সমন্বয় ও নিয়ন্ত্রণ",
      "প্রাণীর প্রজনন",
      "মানবদেহের প্রতিরক্ষা",
      "জিনতত্ত্ব ও বিবর্তন",
      "প্রাণীর আচরণ",
    ],
  },
  {
    name: "উচ্চতর গণিত প্রথম পত্র",
    slug: "higher-math-1",
    icon: "calculate",
    color: "amber",
    order: 7,
    chapters: [
      "ম্যাট্রিক্স ও নির্ণায়ক",
      "ভেক্টর",
      "সরলরেখা",
      "বৃত্ত",
      "বিন্যাস ও সমাবেশ",
      "ত্রিকোণমিতিক অনুপাত",
      "সংযুক্ত কোণের ত্রিকোণমিতিক অনুপাত",
      "ফাংশন ও ফাংশনের লেখচিত্র",
      "অন্তরীকরণ",
      "যোগজীকরণ",
    ],
  },
  {
    name: "উচ্চতর গণিত দ্বিতীয় পত্র",
    slug: "higher-math-2",
    icon: "calculate",
    color: "purple",
    order: 8,
    chapters: [
      "বাস্তব সংখ্যা ও অসমতা",
      "যোগাশ্রয়ী প্রোগ্রাম",
      "জটিল সংখ্যা",
      "বহুপদী ও বহুপদী সমীকরণ",
      "দ্বিপদী বিস্তৃতি",
      "কণিক",
      "বিপরীত ত্রিকোণমিতিক ফাংশন ও ত্রিকোণমিতিক সমীকরণ",
      "স্থিতিবিদ্যা",
      "সমতলে বস্তুকণার গতি",
      "বিস্তার পরিমাপ ও সম্ভাবনা",
    ],
  },
];

async function userHasAnySubjects(ctx: QueryCtx | MutationCtx, currentUser: CurrentUser) {
  const ownedSubjects = await ctx.db
    .query("subjects")
    .withIndex("by_userId", (q) => q.eq("userId", currentUser._id))
    .take(1);

  if (ownedSubjects.length > 0) {
    return true;
  }

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return false;
  }

  const legacySubjects = filterOwnedDocuments(
    currentUser,
    await ctx.db.query("subjects").collect(),
  );
  return legacySubjects.length > 0;
}

async function getOwnedSubjectBySlug(
  ctx: MutationCtx,
  userId: Id<"users">,
  slug: string,
) {
  return await ctx.db
    .query("subjects")
    .withIndex("by_userId_and_slug", (q) => q.eq("userId", userId).eq("slug", slug))
    .unique();
}

async function ensureHscSubject(ctx: MutationCtx, currentUser: CurrentUser, seed: HscSubjectSeed) {
  const existingSubject = await getOwnedSubjectBySlug(ctx, currentUser._id, seed.slug);
  const subjectId =
    existingSubject?._id ??
    (await ctx.db.insert("subjects", {
      userId: currentUser._id,
      name: seed.name,
      slug: seed.slug,
      icon: seed.icon,
      color: seed.color,
      order: seed.order,
      chapterTrackers: HSC_CHAPTER_TRACKERS,
      conceptTrackers: HSC_CONCEPT_TRACKERS,
    }));

  const existingChapters = await ctx.db
    .query("chapters")
    .withIndex("by_userId_and_subjectId", (q) =>
      q.eq("userId", currentUser._id).eq("subjectId", subjectId),
    )
    .collect();
  const existingChapterSlugs = new Set(existingChapters.map((chapter) => chapter.slug));

  for (const [index, chapterName] of seed.chapters.entries()) {
    const slug = `chapter-${index + 1}`;
    if (existingChapterSlugs.has(slug)) {
      continue;
    }

    await ctx.db.insert("chapters", {
      userId: currentUser._id,
      subjectId,
      name: chapterName,
      slug,
      order: index + 1,
      inNextTerm: true,
    });
  }
}

export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);
    const hasSubjects = await userHasAnySubjects(ctx, currentUser);
    const isCompleted = currentUser.onboardingCompletedAt !== undefined;

    return {
      classLevel: currentUser.classLevel ?? null,
      onboardingCompletedAt: currentUser.onboardingCompletedAt ?? null,
      hasSubjects,
      requiresOnboarding: !hasSubjects && !isCompleted,
    };
  },
});

export const selectClassAndSeedSyllabus = mutation({
  args: {
    classLevel: v.literal("hsc"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);

    for (const subject of HSC_SUBJECTS) {
      await ensureHscSubject(ctx, currentUser, subject);
    }

    const completedAt = currentUser.onboardingCompletedAt ?? Date.now();
    await ctx.db.patch(currentUser._id, {
      classLevel: args.classLevel,
      onboardingCompletedAt: completedAt,
    });

    return {
      classLevel: args.classLevel,
      onboardingCompletedAt: completedAt,
      seededSubjectCount: HSC_SUBJECTS.length,
    };
  },
});
