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
import type * as mutations from "../mutations.js";
import type * as ownershipMigration from "../ownershipMigration.js";
import type * as planner from "../planner.js";
import type * as plannerQueries from "../plannerQueries.js";
import type * as queries from "../queries.js";
import type * as studyItemSearch from "../studyItemSearch.js";
import type * as todoQueries from "../todoQueries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  dashboardQueries: typeof dashboardQueries;
  mutations: typeof mutations;
  ownershipMigration: typeof ownershipMigration;
  planner: typeof planner;
  plannerQueries: typeof plannerQueries;
  queries: typeof queries;
  studyItemSearch: typeof studyItemSearch;
  todoQueries: typeof todoQueries;
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
