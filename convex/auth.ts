import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

type AuthenticatedCtx = QueryCtx | MutationCtx;

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

export async function requireCurrentOwner(ctx: AuthenticatedCtx) {
  const identity = await getIdentityOrThrow(ctx);
  const user = await findUserByTokenIdentifier(ctx, identity.tokenIdentifier);

  if (!user) {
    throw new Error("User profile not initialized");
  }

  if (user.role !== "owner") {
    throw new Error("Unauthorized");
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
      const shouldPatch =
        existingUser.clerkUserId !== profile.clerkUserId ||
        existingUser.name !== profile.name ||
        existingUser.email !== profile.email ||
        existingUser.imageUrl !== profile.imageUrl;

      if (shouldPatch) {
        await ctx.db.patch(existingUser._id, profile);
      }

      return {
        userId: existingUser._id,
        role: existingUser.role,
      };
    }

    const firstExistingUser = (await ctx.db.query("users").take(1))[0] ?? null;
    const role = firstExistingUser ? "viewer" : "owner";
    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      role,
      ...profile,
    });

    return {
      userId,
      role,
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
      role: user.role,
      name: user.name,
      email: user.email,
      imageUrl: user.imageUrl,
    };
  },
});
