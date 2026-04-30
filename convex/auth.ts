import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type AuthenticatedCtx = QueryCtx | MutationCtx;
export type CurrentUser = Doc<"users">;

async function getIdentityOrThrow(ctx: AuthenticatedCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Not authenticated");
  }

  return identity;
}

async function findUserByTokenIdentifier(
  ctx: AuthenticatedCtx,
  tokenIdentifier: string,
) {
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier),
    )
    .unique();
}

export function isLegacyWorkspaceOwner(user: Pick<Doc<"users">, "legacyWorkspaceOwner">) {
  return user.legacyWorkspaceOwner === true;
}

export function canAccessOwnedDocument(
  user: Pick<Doc<"users">, "_id" | "legacyWorkspaceOwner">,
  doc: { userId?: Id<"users"> },
) {
  return doc.userId === user._id || (doc.userId === undefined && isLegacyWorkspaceOwner(user));
}

export function assertCanAccessOwnedDocument(
  user: Pick<Doc<"users">, "_id" | "legacyWorkspaceOwner">,
  doc: { userId?: Id<"users"> },
) {
  if (!canAccessOwnedDocument(user, doc)) {
    throw new Error("Unauthorized");
  }
}

export function filterOwnedDocuments<T extends { userId?: Id<"users"> }>(
  user: Pick<Doc<"users">, "_id" | "legacyWorkspaceOwner">,
  docs: T[],
) {
  return docs.filter((doc) => canAccessOwnedDocument(user, doc));
}

export async function requireCurrentUser(ctx: AuthenticatedCtx) {
  const identity = await getIdentityOrThrow(ctx);
  const user = await findUserByTokenIdentifier(ctx, identity.tokenIdentifier);

  if (!user) {
    throw new Error("User profile not initialized");
  }

  return user;
}

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    const existingUser = await findUserByTokenIdentifier(
      ctx,
      identity.tokenIdentifier,
    );
    const profile = {
      clerkUserId: identity.subject,
      name: identity.name ?? undefined,
      email: identity.email ?? undefined,
      imageUrl: identity.pictureUrl ?? undefined,
    };

    if (existingUser) {
      const shouldMarkLegacyWorkspaceOwner =
        existingUser.legacyWorkspaceOwner === undefined &&
        existingUser.role === "owner";
      const shouldPatch =
        existingUser.clerkUserId !== profile.clerkUserId ||
        existingUser.name !== profile.name ||
        existingUser.email !== profile.email ||
        existingUser.imageUrl !== profile.imageUrl ||
        shouldMarkLegacyWorkspaceOwner;

      if (shouldPatch) {
        await ctx.db.patch(existingUser._id, {
          ...profile,
          legacyWorkspaceOwner: shouldMarkLegacyWorkspaceOwner
            ? true
            : existingUser.legacyWorkspaceOwner,
        });
      }

      return {
        userId: existingUser._id,
        role: "owner" as const,
      };
    }

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      role: "owner",
      legacyWorkspaceOwner: false,
      ...profile,
    });

    return {
      userId,
      role: "owner" as const,
    };
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    const user = await findUserByTokenIdentifier(ctx, identity.tokenIdentifier);

    if (!user) {
      return null;
    }

    return {
      _id: user._id,
      role: "owner" as const,
      legacyWorkspaceOwner: user.legacyWorkspaceOwner ?? false,
      name: user.name,
      email: user.email,
      imageUrl: user.imageUrl,
    };
  },
});
