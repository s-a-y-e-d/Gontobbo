const MULTIPLE_SPACES_PATTERN = /\s+/g;
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;
const NON_SEARCH_CHARACTERS_PATTERN = /[^a-z0-9\u0980-\u09ff]+/gi;
const LATIN_LETTER_PATTERN = /[a-z]/i;
const BENGALI_CHARACTER_PATTERN = /[\u0980-\u09ff]/;
const VIRAMA = "্";

const INDEPENDENT_VOWELS: Record<string, string> = {
  "অ": "o",
  "আ": "a",
  "ই": "i",
  "ঈ": "i",
  "উ": "u",
  "ঊ": "u",
  "ঋ": "ri",
  "এ": "e",
  "ঐ": "oi",
  "ও": "o",
  "ঔ": "ou",
};

const DEPENDENT_VOWELS: Record<string, string> = {
  "া": "a",
  "ি": "i",
  "ী": "i",
  "ু": "u",
  "ূ": "u",
  "ৃ": "ri",
  "ে": "e",
  "ৈ": "oi",
  "ো": "o",
  "ৌ": "ou",
};

const CONSONANTS: Record<string, string> = {
  "ক": "k",
  "খ": "kh",
  "গ": "g",
  "ঘ": "gh",
  "ঙ": "ng",
  "চ": "ch",
  "ছ": "chh",
  "জ": "j",
  "ঝ": "jh",
  "ঞ": "n",
  "ট": "t",
  "ঠ": "th",
  "ড": "d",
  "ঢ": "dh",
  "ণ": "n",
  "ত": "t",
  "থ": "th",
  "দ": "d",
  "ধ": "dh",
  "ন": "n",
  "প": "p",
  "ফ": "ph",
  "ব": "b",
  "ভ": "bh",
  "ম": "m",
  "য": "j",
  "র": "r",
  "ল": "l",
  "শ": "sh",
  "ষ": "sh",
  "স": "s",
  "হ": "h",
  "ড়": "r",
  "ঢ়": "rh",
  "য়": "y",
  "ৎ": "t",
  "ং": "ng",
  "ঃ": "h",
  "ঁ": "n",
};

const DIGITS: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

type AcademicDictionaryEntry = {
  triggers: string[];
  aliases: string[];
};

const ACADEMIC_DICTIONARY: AcademicDictionaryEntry[] = [
  { triggers: ["পদার্থবিজ্ঞান"], aliases: ["physics"] },
  { triggers: ["রসায়ন", "রসায়ন"], aliases: ["chemistry"] },
  { triggers: ["জীববিজ্ঞান"], aliases: ["biology"] },
  { triggers: ["গণিত"], aliases: ["math", "mathematics"] },
  { triggers: ["উচ্চতর গণিত"], aliases: ["higher math", "advanced mathematics"] },
  { triggers: ["তথ্য ও যোগাযোগ প্রযুক্তি"], aliases: ["ict", "information technology"] },
  { triggers: ["বাংলা"], aliases: ["bengali"] },
  { triggers: ["ইংরেজি"], aliases: ["english"] },
  { triggers: ["অধ্যায়", "অধ্যায়"], aliases: ["chapter"] },
  { triggers: ["ধারণা"], aliases: ["concept"] },
  { triggers: ["বহুনির্বাচনী"], aliases: ["mcq", "multiple choice"] },
  { triggers: ["সৃজনশীল"], aliases: ["cq", "creative question"] },
  { triggers: ["বোর্ড"], aliases: ["board"] },
  { triggers: ["ক্লাস"], aliases: ["class"] },
  { triggers: ["বই"], aliases: ["book"] },
  { triggers: ["নোট"], aliases: ["note", "notes"] },
  { triggers: ["অনুশীলন"], aliases: ["exercise", "practice"] },
  { triggers: ["গতি"], aliases: ["motion", "kinematics"] },
  { triggers: ["বেগ"], aliases: ["velocity", "speed"] },
  { triggers: ["ত্বরণ"], aliases: ["acceleration"] },
  { triggers: ["সরণ"], aliases: ["displacement"] },
  { triggers: ["দূরত্ব"], aliases: ["distance"] },
  { triggers: ["বল"], aliases: ["force"] },
  { triggers: ["ভর"], aliases: ["mass"] },
  { triggers: ["ওজন"], aliases: ["weight"] },
  { triggers: ["কাজ"], aliases: ["work"] },
  { triggers: ["শক্তি"], aliases: ["energy"] },
  { triggers: ["ক্ষমতা"], aliases: ["power"] },
  { triggers: ["চাপ"], aliases: ["pressure"] },
  { triggers: ["ঘর্ষণ"], aliases: ["friction"] },
  { triggers: ["মহাকর্ষ"], aliases: ["gravity", "gravitation"] },
  { triggers: ["কম্পন"], aliases: ["vibration", "oscillation"] },
  { triggers: ["তরঙ্গ"], aliases: ["wave"] },
  { triggers: ["শব্দ"], aliases: ["sound"] },
  { triggers: ["আলো"], aliases: ["light", "optics"] },
  { triggers: ["তাপ"], aliases: ["heat", "thermal"] },
  { triggers: ["বিদ্যুৎ", "তড়িৎ", "তড়িৎ"], aliases: ["electricity", "electric"] },
  { triggers: ["তড়িৎ প্রবাহ", "তড়িৎ প্রবাহ"], aliases: ["current", "electric current"] },
  { triggers: ["বিভব"], aliases: ["potential", "voltage"] },
  { triggers: ["রোধ"], aliases: ["resistance"] },
  { triggers: ["চৌম্বক"], aliases: ["magnet", "magnetic", "magnetism"] },
  { triggers: ["পরমাণু"], aliases: ["atom", "atomic"] },
  { triggers: ["অণু"], aliases: ["molecule", "molecular"] },
  { triggers: ["নিউক্লিয়াস", "নিউক্লিয়াস"], aliases: ["nucleus"] },
  { triggers: ["কণা"], aliases: ["particle"] },
  { triggers: ["পদার্থ"], aliases: ["matter"] },
  { triggers: ["মৌল"], aliases: ["element"] },
  { triggers: ["যৌগ"], aliases: ["compound"] },
  { triggers: ["মিশ্রণ"], aliases: ["mixture"] },
  { triggers: ["রাসায়নিক বিক্রিয়া", "রাসায়নিক বিক্রিয়া", "বিক্রিয়া", "বিক্রিয়া"], aliases: ["reaction", "chemical reaction"] },
  { triggers: ["জারণ"], aliases: ["oxidation"] },
  { triggers: ["বিজারণ"], aliases: ["reduction"] },
  { triggers: ["অম্ল ক্ষার", "অম্ল-ক্ষার"], aliases: ["acid base", "acids and bases"] },
  { triggers: ["অম্ল"], aliases: ["acid", "acidic"] },
  { triggers: ["ক্ষার"], aliases: ["base", "alkali", "alkaline"] },
  { triggers: ["লবণ"], aliases: ["salt"] },
  { triggers: ["দ্রবণ"], aliases: ["solution"] },
  { triggers: ["দ্রাব্য"], aliases: ["solute"] },
  { triggers: ["দ্রাবক"], aliases: ["solvent"] },
  { triggers: ["মোল"], aliases: ["mole", "molar"] },
  { triggers: ["বন্ধন"], aliases: ["bond", "bonding"] },
  { triggers: ["ইলেকট্রন", "ইলেক্ট্রন"], aliases: ["electron"] },
  { triggers: ["প্রোটন"], aliases: ["proton"] },
  { triggers: ["নিউট্রন"], aliases: ["neutron"] },
  { triggers: ["অনুঘটক"], aliases: ["catalyst"] },
  { triggers: ["সংখ্যা"], aliases: ["number"] },
  { triggers: ["সেট"], aliases: ["set"] },
  { triggers: ["ফাংশন"], aliases: ["function"] },
  { triggers: ["সমীকরণ"], aliases: ["equation"] },
  { triggers: ["অসমতা"], aliases: ["inequality"] },
  { triggers: ["বীজগণিত"], aliases: ["algebra"] },
  { triggers: ["জ্যামিতি"], aliases: ["geometry"] },
  { triggers: ["ত্রিকোণমিতি"], aliases: ["trigonometry"] },
  { triggers: ["সীমা"], aliases: ["limit"] },
  { triggers: ["অন্তরক"], aliases: ["derivative", "differentiation"] },
  { triggers: ["সমাকল"], aliases: ["integral", "integration"] },
  { triggers: ["ভেক্টর"], aliases: ["vector"] },
  { triggers: ["ম্যাট্রিক্স"], aliases: ["matrix"] },
  { triggers: ["সম্ভাবনা"], aliases: ["probability"] },
  { triggers: ["ধারা"], aliases: ["series", "sequence"] },
  { triggers: ["বিন্যাস"], aliases: ["permutation"] },
  { triggers: ["সমাবেশ"], aliases: ["combination"] },
  { triggers: ["লগারিদম"], aliases: ["logarithm", "log"] },
  { triggers: ["গড়", "গড়"], aliases: ["average", "mean"] },
  { triggers: ["অনুপাত"], aliases: ["ratio"] },
  { triggers: ["শতকরা"], aliases: ["percentage", "percent"] },
  { triggers: ["সরলরেখা"], aliases: ["line", "straight line"] },
  { triggers: ["বৃত্ত"], aliases: ["circle"] },
  { triggers: ["ত্রিভুজ"], aliases: ["triangle"] },
  { triggers: ["কোষ"], aliases: ["cell"] },
  { triggers: ["টিস্যু"], aliases: ["tissue"] },
  { triggers: ["অঙ্গ"], aliases: ["organ"] },
  { triggers: ["রক্ত"], aliases: ["blood"] },
  { triggers: ["হৃদপিণ্ড"], aliases: ["heart"] },
  { triggers: ["শ্বাসক্রিয়া", "শ্বাসক্রিয়া"], aliases: ["respiration"] },
  { triggers: ["সালোকসংশ্লেষণ"], aliases: ["photosynthesis"] },
  { triggers: ["ডিএনএ"], aliases: ["dna"] },
  { triggers: ["আরএনএ"], aliases: ["rna"] },
  { triggers: ["জিন"], aliases: ["gene"] },
  { triggers: ["বিবর্তন"], aliases: ["evolution"] },
  { triggers: ["প্রজনন"], aliases: ["reproduction"] },
  { triggers: ["হরমোন"], aliases: ["hormone"] },
  { triggers: ["এনজাইম"], aliases: ["enzyme"] },
  { triggers: ["উদ্ভিদ"], aliases: ["plant"] },
  { triggers: ["প্রাণী"], aliases: ["animal"] },
];

export const STUDY_ITEM_SEARCH_TEXT_VERSION = 1;

export type StudyItemSearchArgs = {
  baseName: string;
  trackerLabel: string;
  subjectName: string;
  chapterName: string;
  conceptName?: string;
  title?: string;
};

type StudyItemSearchArtifacts = {
  title: string;
  titleAliases: string[];
  contextAliases: string[];
  searchText: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(MULTIPLE_SPACES_PATTERN, " ").trim();
}

function uniqueNonEmpty(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      values
        .map((value) => (value ? normalizeWhitespace(value) : ""))
        .filter((value) => value.length > 0),
    ),
  );
}

function normalizeAlias(value: string) {
  return normalizeWhitespace(
    value
      .normalize("NFKD")
      .replace(COMBINING_MARKS_PATTERN, "")
      .toLowerCase()
      .replace(NON_SEARCH_CHARACTERS_PATTERN, " "),
  );
}

function tokenSetContainsPhrase(haystack: string, phrase: string) {
  return (
    haystack === phrase ||
    haystack.startsWith(`${phrase} `) ||
    haystack.endsWith(` ${phrase}`) ||
    haystack.includes(` ${phrase} `)
  );
}

function transliterateWord(word: string) {
  const characters = [...word];
  let result = "";

  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];

    if (INDEPENDENT_VOWELS[current]) {
      result += INDEPENDENT_VOWELS[current];
      continue;
    }

    if (CONSONANTS[current]) {
      result += CONSONANTS[current];

      const next = characters[index + 1];
      if (next && DEPENDENT_VOWELS[next]) {
        result += DEPENDENT_VOWELS[next];
        index += 1;
        continue;
      }

      if (next === VIRAMA) {
        index += 1;
        continue;
      }

      result += "o";
      continue;
    }

    if (DEPENDENT_VOWELS[current]) {
      result += DEPENDENT_VOWELS[current];
      continue;
    }

    if (DIGITS[current]) {
      result += DIGITS[current];
      continue;
    }

    if (LATIN_LETTER_PATTERN.test(current) || /[0-9]/.test(current)) {
      result += current.toLowerCase();
      continue;
    }

    result += " ";
  }

  return normalizeAlias(result);
}

function transliteratePhrase(value: string) {
  return normalizeWhitespace(
    value
      .split(/\s+/)
      .map((word) => transliterateWord(word))
      .join(" "),
  );
}

function stripTerminalInherentO(value: string) {
  return normalizeWhitespace(
    value
      .split(/\s+/)
      .map((word) => (word.endsWith("o") ? word.slice(0, -1) : word))
      .join(" "),
  );
}

function softenBanglish(value: string) {
  return normalizeAlias(
    value
      .replace(/chh/g, "ch")
      .replace(/jh/g, "j")
      .replace(/kh/g, "k")
      .replace(/gh/g, "g")
      .replace(/th/g, "t")
      .replace(/dh/g, "d")
      .replace(/ph/g, "f")
      .replace(/bh/g, "b")
      .replace(/sh/g, "s")
      .replace(/([bcdfghjklmnpqrstvwxyz])o(?=[bcdfghjklmnpqrstvwxyz])/g, "$1a"),
  );
}

function buildBanglishAliases(value: string) {
  if (!BENGALI_CHARACTER_PATTERN.test(value)) {
    return [];
  }

  const transliterated = transliteratePhrase(value);
  const withoutTerminalO = stripTerminalInherentO(transliterated);
  const loose = softenBanglish(transliterated);
  const looseWithoutTerminalO = softenBanglish(withoutTerminalO);

  return uniqueNonEmpty([
    transliterated,
    withoutTerminalO,
    loose,
    looseWithoutTerminalO,
  ]);
}

function collectMeaningAliases(sourceValues: string[]) {
  const normalizedSources = uniqueNonEmpty(sourceValues.map((value) => normalizeAlias(value)));
  const combinedSource = normalizedSources.join(" ");
  const meaningAliases = new Set<string>();

  for (const entry of ACADEMIC_DICTIONARY) {
    const hasMatch = entry.triggers.some((trigger) => {
      const normalizedTrigger = normalizeAlias(trigger);
      return tokenSetContainsPhrase(combinedSource, normalizedTrigger);
    });

    if (!hasMatch) {
      continue;
    }

    for (const alias of entry.aliases) {
      meaningAliases.add(normalizeAlias(alias));
    }
  }

  return Array.from(meaningAliases);
}

function buildTermAliases(value: string, sourceValuesForMeaning: string[] = [value]) {
  const rawValue = normalizeWhitespace(value);
  const normalizedValue = normalizeAlias(rawValue);

  return uniqueNonEmpty([
    rawValue,
    normalizedValue,
    ...buildBanglishAliases(rawValue),
    ...collectMeaningAliases(sourceValuesForMeaning),
  ]);
}

function combineAliases(leftAliases: string[], rightAliases: string[], limit = 40) {
  const combinations: string[] = [];

  for (const left of leftAliases) {
    for (const right of rightAliases) {
      combinations.push(`${left} ${right}`);
      if (combinations.length >= limit) {
        return uniqueNonEmpty(combinations);
      }
    }
  }

  return uniqueNonEmpty(combinations);
}

function compactValue(value: string) {
  return value.replace(/\s+/g, "");
}

function hasOrderedTokens(haystack: string, tokens: string[]) {
  let currentIndex = 0;

  for (const token of tokens) {
    const nextIndex = haystack.indexOf(token, currentIndex);
    if (nextIndex === -1) {
      return false;
    }
    currentIndex = nextIndex + token.length;
  }

  return true;
}

function isSubsequence(needle: string, haystack: string) {
  if (!needle) {
    return false;
  }

  let needleIndex = 0;
  for (const character of haystack) {
    if (character === needle[needleIndex]) {
      needleIndex += 1;
      if (needleIndex === needle.length) {
        return true;
      }
    }
  }

  return false;
}

function scoreAliasGroup(aliases: string[], normalizedQuery: string) {
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const compactQuery = compactValue(normalizedQuery);
  const combinedAliases = normalizeAlias(aliases.join(" "));
  let bestScore = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeAlias(alias);
    if (!normalizedAlias) {
      continue;
    }

    const compactAlias = compactValue(normalizedAlias);

    if (normalizedAlias === normalizedQuery) {
      bestScore = Math.max(bestScore, 1000);
      continue;
    }

    if (normalizedAlias.startsWith(normalizedQuery)) {
      bestScore = Math.max(bestScore, 900);
      continue;
    }

    if (tokenSetContainsPhrase(normalizedAlias, normalizedQuery)) {
      bestScore = Math.max(bestScore, 840);
      continue;
    }

    if (queryTokens.length > 1 && hasOrderedTokens(normalizedAlias, queryTokens)) {
      bestScore = Math.max(bestScore, 760);
      continue;
    }

    if (compactAlias.includes(compactQuery)) {
      bestScore = Math.max(bestScore, 680);
      continue;
    }

    if (isSubsequence(compactQuery, compactAlias)) {
      bestScore = Math.max(bestScore, 560);
    }
  }

  if (bestScore < 760 && queryTokens.length > 1 && hasOrderedTokens(combinedAliases, queryTokens)) {
    bestScore = Math.max(bestScore, 740);
  }

  if (bestScore < 680 && compactValue(combinedAliases).includes(compactQuery)) {
    bestScore = Math.max(bestScore, 660);
  }

  return bestScore;
}

export function buildStudyItemTitle(baseName: string, trackerLabel: string) {
  return `${baseName} — ${trackerLabel}`;
}

export function buildStudyItemSearchArtifacts(
  args: StudyItemSearchArgs,
): StudyItemSearchArtifacts {
  const title = args.title ?? buildStudyItemTitle(args.baseName, args.trackerLabel);
  const baseSourceValues = uniqueNonEmpty([
    args.baseName,
    args.subjectName,
    args.chapterName,
    args.conceptName,
  ]);
  const trackerAliases = buildTermAliases(args.trackerLabel, [args.trackerLabel]);
  const baseNameAliases = buildTermAliases(args.baseName, baseSourceValues);
  const titleAliases = uniqueNonEmpty([
    title,
    ...buildTermAliases(title, [...baseSourceValues, args.trackerLabel, title]),
    ...combineAliases(baseNameAliases, trackerAliases),
  ]);
  const contextAliases = uniqueNonEmpty([
    ...buildTermAliases(args.subjectName, [args.subjectName]),
    ...buildTermAliases(args.chapterName, [args.chapterName, args.subjectName]),
    ...(args.conceptName
      ? buildTermAliases(args.conceptName, [args.conceptName, args.chapterName, args.subjectName])
      : []),
  ]);

  return {
    title,
    titleAliases,
    contextAliases,
    searchText: uniqueNonEmpty([...titleAliases, ...contextAliases]).join(" "),
  };
}

export function scoreStudyItemSearchMatch(args: {
  query: string;
  titleAliases: string[];
  contextAliases: string[];
}) {
  const normalizedQuery = normalizeAlias(args.query);
  if (!normalizedQuery) {
    return 0;
  }

  const titleScore = scoreAliasGroup(args.titleAliases, normalizedQuery);
  const contextScore = scoreAliasGroup(args.contextAliases, normalizedQuery);

  return Math.max(titleScore, Math.max(0, contextScore - 220));
}

export function normalizeStudyItemSearchQuery(value: string) {
  return normalizeAlias(value);
}
