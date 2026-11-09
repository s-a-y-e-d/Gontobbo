import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" };

http.route({ path: "/revision-reminder/snooze", method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: cors })) });
http.route({ path: "/revision-reminder/snooze", method: "POST", handler: httpAction(async (ctx, request) => {
  // This token permits only a one-hour snooze on an existing delivery. It never
  // grants account access, subscription reads, or permission to send a push.
  if (Number(request.headers.get("content-length")) > 2048) return new Response(null, { status: 413, headers: cors });
  try {
    const text = await request.text();
    if (text.length > 2048) return new Response(null, { status: 413, headers: cors });
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || !("deviceId" in body) || typeof body.deviceId !== "string" ||
        !("deliveryId" in body) || typeof body.deliveryId !== "string" ||
        !("token" in body) || typeof body.token !== "string" || body.token.length !== 43) {
      return new Response(null, { status: 400, headers: cors });
    }
    // The internal mutation's v.id validators check these untrusted IDs.
    const ok = await ctx.runMutation(internal.revisionReminders.snoozeFromPush, {
      deviceId: body.deviceId as import("./_generated/dataModel").Id<"revisionPushDevices">,
      deliveryId: body.deliveryId as import("./_generated/dataModel").Id<"revisionReminderDeliveries">,
      token: body.token,
    });
    return new Response(null, { status: ok ? 204 : 403, headers: cors });
  } catch {
    return new Response(null, { status: 400, headers: cors });
  }
}) });

export default http;
