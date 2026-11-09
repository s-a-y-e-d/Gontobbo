import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("remove old revision reminder delivery records", { hourUTC: 21, minuteUTC: 30 }, internal.revisionReminders.cleanup, {});
export default crons;
