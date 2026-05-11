/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as dashboardQueries from "../dashboardQueries.js";
import type * as dashboardStudyItemStats from "../dashboardStudyItemStats.js";
import type * as mutations from "../mutations.js";
import type * as onboarding from "../onboarding.js";
import type * as ownershipMigration from "../ownershipMigration.js";
import type * as planner from "../planner.js";
import type * as plannerQueries from "../plannerQueries.js";
import type * as queries from "../queries.js";
import type * as studyItemSearch from "../studyItemSearch.js";
import type * as syllabusSummaries from "../syllabusSummaries.js";
import type * as todoQueries from "../todoQueries.js";
import type * as todoStudyItemSearchDigests from "../todoStudyItemSearchDigests.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  dashboardQueries: typeof dashboardQueries;
  dashboardStudyItemStats: typeof dashboardStudyItemStats;
  mutations: typeof mutations;
  onboarding: typeof onboarding;
  ownershipMigration: typeof ownershipMigration;
  planner: typeof planner;
  plannerQueries: typeof plannerQueries;
  queries: typeof queries;
  studyItemSearch: typeof studyItemSearch;
  syllabusSummaries: typeof syllabusSummaries;
  todoQueries: typeof todoQueries;
  todoStudyItemSearchDigests: typeof todoStudyItemSearchDigests;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
