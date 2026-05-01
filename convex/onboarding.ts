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
  chapters: HscChapterSeed[];
};

type HscChapterSeed = {
  name: string;
  concepts: string[];
};

const HSC_CHAPTER_TRACKERS: TrackerConfig[] = [
  { key: "mcq", label: "MCQ", avgMinutes: 30 },
  { key: "board", label: "বোর্ড", avgMinutes: 45 },
];

const HSC_CONCEPT_TRACKERS: TrackerConfig[] = [
  { key: "class", label: "ক্লাস", avgMinutes: 20 },
  { key: "book", label: "বই", avgMinutes: 25 },
];

const PLACEHOLDER_CONCEPTS = [
  "concept-1",
  "concept-2",
  "concept-3",
  "concept-4",
  "concept-5",
];

const HSC_SUBJECTS: HscSubjectSeed[] = [
  {
    name: "পদার্থবিজ্ঞান প্রথম পত্র",
    slug: "physics-1",
    icon: "rocket_launch",
    color: "blue",
    order: 1,
    chapters: [
      {
        name: "ভৌত জগৎ ও পরিমাপ",
        concepts: [
          "মাত্রা সমীকরণ দ্বারা সমীকরণের শুদ্ধতা যাচাই",
          "পরিমাপের ত্রুটি",
          "স্ক্রু-গজ, ভার্নিয়ার স্কেল, স্ফেরোমিটার ও নিত্তি",
          "বিভিন্ন এককের Conversion",
        ],
      },
      {
        name: "ভেক্টর",
        concepts: [
          "ভেক্টরের প্রকারভেদ ও আয়ত একক ভেক্টর দ্বারা ভেক্টরের প্রকাশ",
          "দুইটি ভেক্টরের লব্ধি",
          "ভেক্টরের উপাংশ",
          "নদী ও নৌকা",
          "ভেক্টর বিয়োগ ও আপেক্ষিক বেগ",
          "দুইয়ের অধিক ভেক্টরের লব্ধি",
          "ভেক্টরের ডট গুণন",
          "দিক কোসাইন",
          "ভেক্টরের ক্রস গুণন",
          "ভেক্টর ক্যালকুলাস",
        ],
      },
      {
        name: "গতিবিদ্যা",
        concepts: [
          "গতির সাধারণ সমীকরণের ব্যবহার",
          "উল্লম্ব গতি",
          "প্রক্ষিপ্ত বস্তুর গতি",
          "বৃত্তাকার গতি",
        ],
      },
      {
        name: "নিউটনিয়ান বলবিদ্যা",
        concepts: [
          "নিউটনের সূত্র",
          "বলের প্রকারভেদ",
          "বলের ঘাত ও ঘাত বল",
          "ভরবেগ, ভরবেগের সংরক্ষণ সূত্র ও সংঘর্ষ",
          "লিফট",
          "জড়তার ভ্রামক ও চক্রগতির ব্যাসার্ধ",
          "দ্বন্দ্ব ও টর্ক",
          "কৌণিক ভরবেগ",
          "কৌণিক গতিশক্তি",
          "কেন্দ্রমুখী বল ও সুতার টান",
          "রাস্তার ব্যাংকিং",
        ],
      },
      {
        name: "কাজ, শক্তি ও ক্ষমতা",
        concepts: [
          "কৃতকাজ",
          "স্প্রিং বল দ্বারা কৃতকাজ",
          "বিভবশক্তি ও গতিশক্তি",
          "কাজ-শক্তি উপপাদ্য",
          "ক্ষমতা",
          "কুয়া ও চৌবাচ্চা",
        ],
      },
      {
        name: "মহাকর্ষ ও অভিকর্ষ",
        concepts: [
          "মহাকর্ষীয় বলের সূত্রের ব্যবহার",
          "অভিকর্ষজ ত্বরণ",
          "মহাকর্ষীয় প্রাবল্য ও বিভব",
          "কেপলারের সূত্র",
          "মুক্তিবেগ (Escape Velocity)",
          "উপগ্রহের গতি",
        ],
      },
      {
        name: "পদার্থের গাঠনিক ধর্ম",
        concepts: [
          "ইয়ং এর গুণাঙ্ক, কাঠিন্যের গুণাঙ্ক ও আয়তন গুণাঙ্ক",
          "পয়সনের অনুপাত",
          "অসহ পীড়ন, কৃতকাজ ও সঞ্চিত শক্তি",
          "সান্দ্রতা এবং স্টোকসের সূত্র",
          "পৃষ্ঠটান ও পৃষ্ঠশক্তি",
          "কৈশিকতা ও স্পর্শ কোণ",
          "তরল ফোঁটা ও বুদবুদের অভ্যন্তরস্থ অতিরিক্ত চাপ",
        ],
      },
      {
        name: "পর্যাবৃত্ত গতি",
        concepts: [
          "সরল ছন্দিত স্পন্দনের অন্তরক সমীকরণ",
          "সরল ছন্দিত স্পন্দন ও সরল দোলক",
          "সরল ছন্দিত গতি সম্পন্ন কণার শক্তি",
          "স্প্রিং এর গতি",
        ],
      },
      {
        name: "তরঙ্গ",
        concepts: [
          "তরঙ্গ সংক্রান্ত বিভিন্ন রাশি",
          "অগ্রগামী তরঙ্গ ও স্থির তরঙ্গ",
          "বিট ও তরঙ্গের তীব্রতা",
          "টানা তারের আড় কম্পনের সূত্র",
        ],
      },
      {
        name: "আদর্শ গ্যাস ও গ্যাসের গতিতত্ত্ব",
        concepts: [
          "বয়েল, চার্লস ও চাপীয় সূত্র",
          "আদর্শ গ্যাসের সমীকরণ",
          "বর্গমূল গড় বর্গবেগ (RMS Velocity)",
          "গ্যাসের গতিতত্ত্ব ও গতিশক্তি",
          "গড় মুক্তপথ",
          "শিশিরাঙ্ক ও আপেক্ষিক আর্দ্রতা",
        ],
      },
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
    ].map((name) => ({ name, concepts: PLACEHOLDER_CONCEPTS })),
  },
  {
    name: "রসায়ন প্রথম পত্র",
    slug: "chemistry-1",
    icon: "science",
    color: "green",
    order: 3,
    chapters: [
      { name: "ল্যাবরেটরির নিরাপদ ব্যবহার", concepts: PLACEHOLDER_CONCEPTS },
      { name: "গুণগত রসায়ন", concepts: PLACEHOLDER_CONCEPTS },
      {
        name: "মৌলের পর্যায়বৃত্ত ধর্ম ও রাসায়নিক বন্ধন",
        concepts: PLACEHOLDER_CONCEPTS,
      },
      {
        name: "রাসায়নিক পরিবর্তন",
        concepts: [
          "বিক্রিয়ার হার (Rate of Reaction)",
          "লা-শাতেলিয়ারের নীতি (Le Chatelier's Principle)",
          "ভরক্রিয়ার সূত্র ও সাম্যাঙ্ক",
          "অম্ল-ক্ষার এবং pH (Acid-Base and pH)",
          "বাফার দ্রবণ ও বাফার দ্রবণের ক্রিয়াকৌশল",
          "তাপ রসায়ন (Thermochemistry)",
        ],
      },
      {
        name: "কর্মমুখী রসায়ন",
        concepts: [
          "প্রাকৃতিক এবং কৃত্রিম খাদ্য সংরক্ষক",
          "ভিনেগার ও ভিনেগারের ক্রিয়াকৌশল",
          "খাদ্য কৌটাজাতকরণ (Food Canning)",
          "দ্রবণ, কলয়েড, সাসপেনশন ও দুধ",
          "টয়লেট্রিজ ও পারফিউমারি পরিষ্কারক",
        ],
      },
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
    ].map((name) => ({ name, concepts: PLACEHOLDER_CONCEPTS })),
  },
  {
    name: "জীববিজ্ঞান প্রথম পত্র",
    slug: "biology-1",
    icon: "biotech",
    color: "pink",
    order: 5,
    chapters: [
      {
        name: "কোষ ও এর গঠন",
        concepts: [
          "কোষ, প্রোটোপ্লাজম, সাইটোপ্লাজম",
          "কোষপ্রাচীর ও কোষঝিল্লি",
          "অঙ্গাণু: রাইবোসোম, গলগি বডি, লাইসোজোম, এন্ডোপ্লাজমিক রেটিকুলাম",
          "মাইটোকন্ড্রিয়া ও প্লাস্টিড",
          "নিউক্লিয়াস ও ক্রোমোজোম",
          "নিউক্লিক এসিড: DNA, RNA এবং DNA রেপ্লিকেশন",
          "ট্রান্সক্রিপশন, ট্রান্সলেশন, জিন ও জেনেটিক কোড",
        ],
      },
      {
        name: "কোষ বিভাজন",
        concepts: [
          "অ্যামাইটোসিস ও কোষচক্র (ইন্টারফেজ)",
          "মাইটোসিস ও মিয়োসিস বিভাজন",
          "ক্রসিং ওভার",
        ],
      },
      {
        name: "কোষ রসায়ন",
        concepts: [
          "কার্বোহাইড্রেট: প্রকারভেদ (মনো, ডাই, অলিগো ও পলিস্যাকারাইড)",
          "অ্যামিনো এসিড ও প্রোটিন",
          "লিপিড ও এনজাইম (উৎসেচক)",
        ],
      },
      {
        name: "অণুজীব",
        concepts: [
          "ভাইরাস: গঠন, অর্থনৈতিক গুরুত্ব ও রোগসমূহ",
          "ব্যাকটেরিয়া: গঠন ও অর্থনৈতিক গুরুত্ব",
          "ম্যালেরিয়া পরজীবী (Plasmodium)",
        ],
      },
      {
        name: "শৈবাল ও ছত্রাক",
        concepts: [
          "শৈবাল: Ulothrix ও অর্থনৈতিক গুরুত্ব",
          "ছত্রাক: Agaricus, ছত্রাকঘটিত রোগ ও লাইকেন",
        ],
      },
      {
        name: "ব্রায়োফাইটা ও টেরিডোফাইটা",
        concepts: [
          "ব্রায়োফাইটা (মস) ও টেরিডোফাইটা (ফার্ন) এর বৈশিষ্ট্য ও গঠন",
        ],
      },
      {
        name: "নগ্নবীজী ও আবৃতবীজী",
        concepts: [
          "নগ্নবীজী উদ্ভিদ: Cycas",
          "আবৃতবীজী উদ্ভিদ: পুষ্পপ্রতীক ও পুষ্পসংকেত",
          "গোত্র পরিচিতি: Poaceae (একবীজপত্রী) ও Malvaceae (দ্বিবীজপত্রী)",
        ],
      },
      {
        name: "টিস্যু ও টিস্যুতন্ত্র",
        concepts: [
          "ভাজক টিস্যু ও স্থায়ী টিস্যু",
          "টিস্যুতন্ত্র ও পরিবহন টিস্যুতন্ত্র (Vascular Bundle)",
          "উদ্ভিদের মূল ও কাণ্ডের অন্তর্গঠন",
        ],
      },
      {
        name: "উদ্ভিদ শারীরতত্ত্ব",
        concepts: [
          "খনিজ লবণ পরিশোষণ ও প্রস্বেদন",
          "সালোকসংশ্লেষণ ও শ্বসন",
        ],
      },
      {
        name: "উদ্ভিদ প্রজনন",
        concepts: ["যৌন ও অযৌন প্রজনন প্রক্রিয়া"],
      },
      {
        name: "জীবপ্রযুক্তি (Biotechnology)",
        concepts: [
          "টিস্যু কালচার ও জেনেটিক ইঞ্জিনিয়ারিং",
          "রিকম্বিন্যান্ট DNA প্রযুক্তি ও এর প্রয়োগ",
          "জিনোম সিকোয়েন্সিং ও জিন ক্লোনিং",
        ],
      },
      {
        name: "জীবের পরিবেশ, বিস্তার ও সংরক্ষণ",
        concepts: [
          "পরিবেশ ও অভিযোজন",
          "বায়োম, প্রাণিভৌগোলিক অঞ্চল ও বাংলাদেশের বনাঞ্চল",
          "জীববৈচিত্র্য ও এর সংরক্ষণ",
        ],
      },
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
    ].map((name) => ({ name, concepts: PLACEHOLDER_CONCEPTS })),
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
    ].map((name) => ({ name, concepts: PLACEHOLDER_CONCEPTS })),
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
    ].map((name) => ({ name, concepts: PLACEHOLDER_CONCEPTS })),
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
  currentUser: CurrentUser,
  slug: string,
) {
  const ownedSubject = await ctx.db
    .query("subjects")
    .withIndex("by_userId_and_slug", (q) =>
      q.eq("userId", currentUser._id).eq("slug", slug),
    )
    .unique();

  if (ownedSubject) {
    return ownedSubject;
  }

  if (!isLegacyWorkspaceOwner(currentUser)) {
    return null;
  }

  const legacySubjects = await ctx.db
    .query("subjects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(50);

  return legacySubjects.find((subject) => subject.userId === undefined) ?? null;
}

async function ensureHscSubject(ctx: MutationCtx, currentUser: CurrentUser, seed: HscSubjectSeed) {
  const existingSubject = await getOwnedSubjectBySlug(ctx, currentUser, seed.slug);
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

  if (
    existingSubject &&
    (existingSubject.name !== seed.name ||
      existingSubject.icon !== seed.icon ||
      existingSubject.color !== seed.color ||
      existingSubject.order !== seed.order)
  ) {
    await ctx.db.patch(existingSubject._id, {
      name: seed.name,
      icon: seed.icon,
      color: seed.color,
      order: seed.order,
    });
  }

  let existingChapters = filterOwnedDocuments(
    currentUser,
    await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", subjectId))
      .collect(),
  );
  const existingChaptersBySlug = new Map(
    existingChapters.map((chapter) => [chapter.slug, chapter]),
  );

  for (const [index, chapterSeed] of seed.chapters.entries()) {
    const slug = `chapter-${index + 1}`;
    const existingChapter = existingChaptersBySlug.get(slug);
    if (existingChapter) {
      if (
        existingChapter.name !== chapterSeed.name ||
        existingChapter.order !== index + 1 ||
        !existingChapter.inNextTerm
      ) {
        await ctx.db.patch(existingChapter._id, {
          name: chapterSeed.name,
          order: index + 1,
          inNextTerm: true,
        });
      }
      continue;
    }

    const chapter = {
      userId: currentUser._id,
      subjectId,
      name: chapterSeed.name,
      slug,
      order: index + 1,
      inNextTerm: true,
    };
    await ctx.db.insert("chapters", chapter);
  }

  existingChapters = filterOwnedDocuments(
    currentUser,
    await ctx.db
      .query("chapters")
      .withIndex("by_subject", (q) => q.eq("subjectId", subjectId))
      .collect(),
  );

  for (const [index, chapterSeed] of seed.chapters.entries()) {
    const chapter = existingChapters.find(
      (existingChapter) => existingChapter.slug === `chapter-${index + 1}`,
    );
    if (!chapter) {
      continue;
    }

    const existingConcepts = filterOwnedDocuments(
      currentUser,
      await ctx.db
        .query("concepts")
        .withIndex("by_chapter", (q) => q.eq("chapterId", chapter._id))
        .collect(),
    );
    const existingConceptNames = new Set(
      existingConcepts.map((concept) => concept.name),
    );
    let nextOrder =
      existingConcepts.length > 0
        ? Math.max(...existingConcepts.map((concept) => concept.order)) + 1
        : 1;

    for (const conceptName of chapterSeed.concepts) {
      if (existingConceptNames.has(conceptName)) {
        continue;
      }

      await ctx.db.insert("concepts", {
        userId: currentUser._id,
        chapterId: chapter._id,
        name: conceptName,
        order: nextOrder,
      });
      existingConceptNames.add(conceptName);
      nextOrder += 1;
    }
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

export const syncHscSyllabusForCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireCurrentUser(ctx);

    for (const subject of HSC_SUBJECTS) {
      await ensureHscSubject(ctx, currentUser, subject);
    }

    return {
      syncedSubjectCount: HSC_SUBJECTS.length,
    };
  },
});
