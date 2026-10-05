"use server";

import { revalidatePath } from "next/cache";
import { runDailyJob, runLiveJob, runMarketHoursJob } from "@/lib/scheduled-jobs";
import type { AdminRole, AnnouncementLevel, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertStaff, isBuiltInOwner, StaffError, type Capability, type Staff } from "@/lib/admin/access";
import { audit } from "@/lib/admin/audit";
import { getCost, setScheduleEnabled } from "@/lib/admin/aws";
import { postNote, postStaffReply, ticketHead, MAX_REPLY, type TicketKind } from "@/lib/support/tickets";
import { sendAnnouncementEmail, sendDeletionConfirmedEmail } from "@/lib/email";
import { DELETION_WINDOW_DAYS } from "@/lib/account-status";
import { JOBS, recordJob, type JobName } from "@/lib/jobs";
import { siteUrl } from "@/lib/site";
import { text, oneLine } from "@/lib/text";
import { logError } from "@/lib/logger";

// Everything staff can change from the admin portal. Each action checks the
// staff member's role, validates its input, and is written to the audit log.
// Results are returned (not thrown) so the message survives production builds.

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

async function run(cap: Capability, fn: (staff: Staff) => Promise<AdminResult>): Promise<AdminResult> {
  try {
    const staff = await assertStaff(cap);
    return await fn(staff);
  } catch (err) {
    if (err instanceof StaffError) return { ok: false, error: err.message };
    logError("admin.action", err);
    return { ok: false, error: "Something went wrong — it's been logged. Try again." };
  }
}

const KINDS = new Set<TicketKind>(["case", "feedback"]);
const STATUSES = new Set<TicketStatus>(["OPEN", "PENDING", "RESOLVED"]);
const PRIORITIES = new Set<TicketPriority>(["LOW", "NORMAL", "HIGH", "URGENT"]);

// ---------------- inbox ----------------

export async function replyToTicket(kind: TicketKind, id: string, rawBody: string, opts: { email: boolean; status: TicketStatus }): Promise<AdminResult> {
  return run("inbox", async (staff) => {
    const body = text(rawBody);
    if (!KINDS.has(kind) || !STATUSES.has(opts?.status)) return { ok: false, error: "Invalid request." };
    if (!body) return { ok: false, error: "Write a reply first." };
    if (body.length > MAX_REPLY) return { ok: false, error: `Keep replies under ${MAX_REPLY.toLocaleString("en-IN")} characters.` };
    const t = await ticketHead(kind, id);
    if (!t) return { ok: false, error: "That conversation no longer exists." };
    const { emailStatus } = await postStaffReply(t, staff, body, { email: !!opts.email, status: opts.status });
    await audit(staff, `${kind}.reply`, { type: kind, id }, `Replied to ${t.ref}`, { emailStatus, status: opts.status });
    revalidatePath("/admin", "layout");
    const where = t.userId ? "in their Support page" : "";
    if (emailStatus === "sent") return { ok: true, message: `Reply sent — emailed${where ? ` and shown ${where}` : ""}.` };
    if (emailStatus === "skipped") return { ok: true, message: `Reply saved${where ? ` and shown ${where}` : ""} (no email).` };
    return { ok: true, message: `Reply saved${where ? ` and shown ${where}` : ""}, but the email failed (${emailStatus.replace("failed: ", "")}).` };
  });
}

export async function addTicketNote(kind: TicketKind, id: string, rawBody: string): Promise<AdminResult> {
  return run("inbox", async (staff) => {
    const body = text(rawBody);
    if (!KINDS.has(kind) || !body || body.length > MAX_REPLY) return { ok: false, error: "Write a note (up to 5,000 characters)." };
    const t = await ticketHead(kind, id);
    if (!t) return { ok: false, error: "That conversation no longer exists." };
    await postNote(t, staff, body);
    await audit(staff, `${kind}.note`, { type: kind, id }, `Internal note on ${t.ref}`);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Note added (only staff can see it)." };
  });
}

export async function updateTicket(
  kind: TicketKind,
  id: string,
  patch: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null; tags?: string[] },
): Promise<AdminResult> {
  return run("inbox", async (staff) => {
    if (!KINDS.has(kind)) return { ok: false, error: "Invalid request." };
    const data: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null; tags?: string[] } = {};
    if (patch.status !== undefined) {
      if (!STATUSES.has(patch.status)) return { ok: false, error: "Invalid status." };
      data.status = patch.status;
    }
    if (patch.priority !== undefined) {
      if (!PRIORITIES.has(patch.priority)) return { ok: false, error: "Invalid priority." };
      data.priority = patch.priority;
    }
    if (patch.assigneeId !== undefined) {
      if (patch.assigneeId !== null) {
        const a = await prisma.user.findUnique({ where: { id: patch.assigneeId }, select: { adminRole: true, email: true } });
        if (!a || (!a.adminRole && !isBuiltInOwner(a.email))) return { ok: false, error: "You can only assign to a team member." };
      }
      data.assigneeId = patch.assigneeId;
    }
    if (patch.tags !== undefined) {
      data.tags = [...new Set(patch.tags.map((t) => oneLine(t, 30).toLowerCase()).filter(Boolean))].slice(0, 8);
    }
    const t = await ticketHead(kind, id);
    if (!t) return { ok: false, error: "That conversation no longer exists." };
    if (kind === "case") await prisma.supportCase.update({ where: { id }, data });
    else await prisma.feedback.update({ where: { id }, data });
    await audit(staff, `${kind}.update`, { type: kind, id }, `Updated ${t.ref}`, data);
    revalidatePath("/admin", "layout");
    return { ok: true };
  });
}

// ---------------- users ----------------

async function targetUser(userId: string, staff: Staff, opts: { notSelf?: boolean; notOwner?: boolean } = {}) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, username: true, status: true, adminRole: true } });
  if (!u) throw new StaffError("That account no longer exists.");
  if (opts.notSelf && u.id === staff.id) throw new StaffError("You can't do this to your own account.");
  if (opts.notOwner && (isBuiltInOwner(u.email) || u.adminRole === "OWNER")) throw new StaffError("Owner accounts can't be changed this way.");
  return u;
}

export async function suspendUser(userId: string, rawReason: string): Promise<AdminResult> {
  return run("users.manage", async (staff) => {
    const reason = oneLine(rawReason, 300);
    if (!reason) return { ok: false, error: "Give a reason — it's kept on the account and in the audit log." };
    const u = await targetUser(userId, staff, { notSelf: true, notOwner: true });
    await prisma.$transaction([
      prisma.user.update({ where: { id: u.id }, data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: reason } }),
      // Signed out everywhere, and nothing keeps trading on their behalf.
      prisma.session.deleteMany({ where: { userId: u.id } }),
      prisma.paperSession.updateMany({ where: { userId: u.id, status: "ACTIVE" }, data: { status: "PAUSED" } }),
    ]);
    await audit(staff, "user.suspend", { type: "user", id: u.id }, `Suspended ${u.email}`, { reason });
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${u.email} is suspended and signed out everywhere. Their active forward tests were paused.` };
  });
}

export async function unsuspendUser(userId: string): Promise<AdminResult> {
  return run("users.manage", async (staff) => {
    const u = await targetUser(userId, staff);
    if (u.status !== "SUSPENDED") return { ok: false, error: "This account isn't suspended." };
    await prisma.user.update({ where: { id: u.id }, data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null } });
    await audit(staff, "user.unsuspend", { type: "user", id: u.id }, `Restored ${u.email}`);
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${u.email} can sign in again. Their forward tests stay paused until they resume them.` };
  });
}

export async function signOutUserEverywhere(userId: string): Promise<AdminResult> {
  return run("users.manage", async (staff) => {
    const u = await targetUser(userId, staff, { notSelf: true });
    const { count } = await prisma.session.deleteMany({ where: { userId: u.id } });
    await audit(staff, "user.signout", { type: "user", id: u.id }, `Signed ${u.email} out of ${count} session(s)`);
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Signed out of ${count} session${count === 1 ? "" : "s"}.` };
  });
}

/** Starts a conversation with the user: it appears on their Support page (they can reply) and is emailed. */
export async function messageUser(userId: string, rawSubject: string, rawBody: string, opts: { email: boolean }): Promise<AdminResult> {
  return run("inbox", async (staff) => {
    const subject = oneLine(rawSubject, 200);
    const body = text(rawBody);
    if (!subject || !body) return { ok: false, error: "Add a subject and a message." };
    if (body.length > MAX_REPLY) return { ok: false, error: "Keep the message under 5,000 characters." };
    const u = await targetUser(userId, staff);
    const c = await prisma.supportCase.create({ data: { userId: u.id, email: u.email, subject, message: "", status: "PENDING" } });
    const t = await ticketHead("case", c.id);
    const { emailStatus } = await postStaffReply(t!, staff, body, { email: opts.email, status: "PENDING" });
    await audit(staff, "user.message", { type: "user", id: u.id }, `Messaged ${u.email}: ${subject}`, { caseId: c.id, emailStatus });
    revalidatePath("/admin", "layout");
    return { ok: true, message: emailStatus === "sent" ? "Sent — in their Support page and by email." : emailStatus === "skipped" ? "Sent to their Support page." : `On their Support page, but the email failed (${emailStatus.replace("failed: ", "")}).` };
  });
}

export async function scheduleUserDeletion(userId: string, rawReason: string): Promise<AdminResult> {
  return run("users.manage", async (staff) => {
    const reason = oneLine(rawReason, 300);
    if (!reason) return { ok: false, error: "Record why (e.g. “user asked by email, case MAA-100012”)." };
    const u = await targetUser(userId, staff, { notSelf: true, notOwner: true });
    if (u.status === "PENDING_DELETION") return { ok: false, error: "Deletion is already scheduled." };
    const when = new Date(Date.now() + DELETION_WINDOW_DAYS * 86_400_000);
    await prisma.$transaction([
      prisma.user.update({ where: { id: u.id }, data: { status: "PENDING_DELETION", deletionRequestedAt: new Date(), deletionScheduledFor: when } }),
      prisma.session.deleteMany({ where: { userId: u.id } }),
    ]);
    await sendDeletionConfirmedEmail(u.email, when).catch((err) => logError("admin.deletion-email", err));
    await audit(staff, "user.schedule-deletion", { type: "user", id: u.id }, `Scheduled deletion of ${u.email}`, { reason, when: when.toISOString() });
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Deletion scheduled for ${when.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}. Signing back in before then cancels it.` };
  });
}

export async function cancelUserDeletion(userId: string): Promise<AdminResult> {
  return run("users.manage", async (staff) => {
    const u = await targetUser(userId, staff);
    if (u.status !== "PENDING_DELETION") return { ok: false, error: "No deletion is scheduled." };
    await prisma.user.update({ where: { id: u.id }, data: { status: "ACTIVE", deletionRequestedAt: null, deletionScheduledFor: null } });
    await audit(staff, "user.cancel-deletion", { type: "user", id: u.id }, `Cancelled deletion of ${u.email}`);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Deletion cancelled — the account is active." };
  });
}

/** For a security incident: removes the saved broker keys and session (never shown to staff). */
export async function disconnectUserBroker(userId: string, broker: string): Promise<AdminResult> {
  return run("users.manage", async (staff) => {
    const u = await targetUser(userId, staff);
    const { count } = await prisma.brokerConnection.deleteMany({ where: { userId: u.id, broker } });
    if (!count) return { ok: false, error: "No such broker connection." };
    await audit(staff, "user.broker-disconnect", { type: "user", id: u.id }, `Disconnected ${broker} for ${u.email}`);
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${broker} disconnected. Their saved keys were deleted.` };
  });
}

// ---------------- team ----------------

export async function setStaffRole(rawEmail: string, role: AdminRole | null): Promise<AdminResult> {
  return run("team", async (staff) => {
    const email = text(rawEmail).toLowerCase();
    if (role !== null && !["OWNER", "ADMIN", "SUPPORT"].includes(role)) return { ok: false, error: "Invalid role." };
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true, adminRole: true } });
    if (!u) return { ok: false, error: "No MyAlgoAgent account uses that email — they need to sign up first." };
    if (isBuiltInOwner(u.email)) return { ok: false, error: "The built-in owner's access can't be changed." };
    if (u.id === staff.id) return { ok: false, error: "You can't change your own role." };
    if (u.status === "SUSPENDED") return { ok: false, error: "That account is suspended." };
    await prisma.user.update({ where: { id: u.id }, data: { adminRole: role } });
    await audit(staff, role ? "team.grant" : "team.revoke", { type: "user", id: u.id }, role ? `Made ${u.email} ${role}` : `Removed ${u.email} from the team`, { from: u.adminRole, to: role });
    revalidatePath("/admin", "layout");
    return { ok: true, message: role ? `${u.email} is now ${role.toLowerCase()}. They'll see “Admin” in their account menu.` : `${u.email} no longer has admin access.` };
  });
}

// ---------------- announcements ----------------

const LEVELS = new Set<AnnouncementLevel>(["INFO", "SUCCESS", "WARNING", "CRITICAL"]);

export async function createAnnouncement(input: {
  title: string;
  body: string;
  level: AnnouncementLevel;
  link?: string;
  endsAt?: string;
  notify: boolean;
  email: boolean;
}): Promise<AdminResult> {
  return run("announcements", async (staff) => {
    const title = oneLine(input?.title, 120);
    const body = text(input?.body);
    const link = text(input?.link);
    if (!title || !body) return { ok: false, error: "Add a title and a message." };
    if (body.length > 1_000) return { ok: false, error: "Keep announcements under 1,000 characters." };
    if (!LEVELS.has(input.level)) return { ok: false, error: "Invalid level." };
    if (link && !(link.startsWith("/") || link.startsWith(siteUrl))) return { ok: false, error: "Links must point to a MyAlgoAgent page (start with / or https://myalgoagent.com)." };
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= new Date())) return { ok: false, error: "The end time must be in the future." };

    const a = await prisma.announcement.create({ data: { title, body, level: input.level, link: link || null, endsAt, createdById: staff.id } });
    let notified = 0;
    let emailed = 0;
    let emailFailed = 0;
    if (input.notify || input.email) {
      const users = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, email: true } });
      if (input.notify) {
        const r = await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: "ANNOUNCEMENT" as const, message: `${title} — ${body.slice(0, 160)}`, link: link || null })) });
        notified = r.count;
      }
      if (input.email) {
        const full = link ? (link.startsWith("/") ? `${siteUrl}${link}` : link) : null;
        for (let i = 0; i < users.length; i += 5) {
          const res = await Promise.allSettled(users.slice(i, i + 5).map((u) => sendAnnouncementEmail(u.email, { title, body, link: full })));
          emailed += res.filter((r) => r.status === "fulfilled").length;
          emailFailed += res.filter((r) => r.status === "rejected").length;
        }
      }
      await prisma.announcement.update({ where: { id: a.id }, data: { notifiedAt: new Date() } });
    }
    await audit(staff, "announcement.create", { type: "announcement", id: a.id }, title, { level: input.level, notified, emailed, emailFailed });
    revalidatePath("/", "layout");
    const parts = ["Banner is live"];
    if (input.notify) parts.push(`${notified} notification${notified === 1 ? "" : "s"}`);
    if (input.email) parts.push(`${emailed} email${emailed === 1 ? "" : "s"} sent${emailFailed ? `, ${emailFailed} failed (email is limited until AWS approves production sending)` : ""}`);
    return { ok: true, message: `${parts.join(" · ")}.` };
  });
}

export async function endAnnouncement(id: string): Promise<AdminResult> {
  return run("announcements", async (staff) => {
    const a = await prisma.announcement.update({ where: { id }, data: { active: false, endsAt: new Date() } }).catch(() => null);
    if (!a) return { ok: false, error: "Announcement not found." };
    await audit(staff, "announcement.end", { type: "announcement", id }, a.title);
    revalidatePath("/", "layout");
    return { ok: true, message: "Banner taken down." };
  });
}

// ---------------- jobs & system ----------------

export async function setJobSchedule(job: JobName, enabled: boolean): Promise<AdminResult> {
  return run("system", async (staff) => {
    const def = JOBS[job];
    if (!def) return { ok: false, error: "Unknown job." };
    await setScheduleEnabled(def.rule, enabled);
    await audit(staff, enabled ? "job.resume" : "job.pause", { type: "job", id: job }, `${enabled ? "Resumed" : "Paused"} ${def.label}`);
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${def.label} ${enabled ? "resumed" : "paused"}.` };
  });
}

export async function runJobNow(job: JobName): Promise<AdminResult> {
  return run("system", async (staff) => {
    if (!JOBS[job]) return { ok: false, error: "Unknown job." };
    const summary = job === "paper-sync" ? await recordJob(job, runMarketHoursJob) : job === "live-deployments" ? await recordJob(job, runLiveJob) : await recordJob(job, runDailyJob);
    await audit(staff, "job.run", { type: "job", id: job }, `Ran ${JOBS[job].label} manually`, summary);
    revalidatePath("/admin", "layout");
    const s = summary as unknown as Record<string, number>;
    return {
      ok: true,
      message: job === "live-deployments" ? `Checked ${s.total} live strateg${s.total === 1 ? "y" : "ies"}${s.acted ? `, ${s.acted} sent an order` : ""}${s.failed ? ` (${s.failed} failed)` : ""}.` : job === "paper-sync" ? `Synced ${s.synced} of ${s.total} active session${s.total === 1 ? "" : "s"}${s.failed ? ` (${s.failed} failed)` : ""}.` : `Purged ${s.purged} account${s.purged === 1 ? "" : "s"}${s.failed ? `, ${s.failed} failed` : ""}.`,
    };
  });
}

export async function refreshCost(): Promise<AdminResult> {
  return run("system", async (staff) => {
    await getCost({ refresh: true });
    await audit(staff, "system.cost-refresh", null, "Refreshed AWS cost ($0.02)");
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Cost refreshed." };
  });
}

// ---------------- live trading ----------------

/** Owner-only: allow (or stop) real orders for an account. */
/** Assign (or clear) the static IP a user registers at their broker. One IP per client. */
export async function setStaticIp(userId: string, ip: string | null): Promise<AdminResult> {
  return run("team", async (staff) => {
    const u = await targetUser(userId, staff);
    const value = ip?.trim() || null;
    if (value && !/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value)) return { ok: false, error: "That isn't a valid IPv4 address." };
    if (value) {
      const taken = await prisma.user.findFirst({ where: { liveStaticIp: value, id: { not: u.id } }, select: { email: true } });
      if (taken) return { ok: false, error: `${value} is already assigned to ${taken.email}. Brokers allow one client per static IP.` };
    }
    await prisma.user.update({ where: { id: u.id }, data: { liveStaticIp: value } });
    await audit(staff, value ? "user.static-ip" : "user.static-ip-clear", { type: "user", id: u.id }, value ? `Assigned static IP ${value} to ${u.email}` : `Cleared the static IP of ${u.email}`);
    revalidatePath("/admin", "layout");
    revalidatePath("/app/live-trading");
    return { ok: true, message: value ? `${value} is now assigned to ${u.email}.` : `Static IP cleared for ${u.email}.` };
  });
}

export async function setLiveTrading(userId: string, enabled: boolean): Promise<AdminResult> {
  return run("team", async (staff) => {
    const u = await targetUser(userId, staff);
    if (u.status !== "ACTIVE") return { ok: false, error: "Only active accounts can trade." };
    await prisma.user.update({ where: { id: u.id }, data: { liveTradingEnabledAt: enabled ? new Date() : null } });
    await audit(staff, enabled ? "user.live-on" : "user.live-off", { type: "user", id: u.id }, `${enabled ? "Enabled" : "Disabled"} live trading for ${u.email}`);
    revalidatePath("/admin", "layout");
    revalidatePath("/app/live-trading");
    return { ok: true, message: enabled ? `Live trading is on for ${u.email}.` : `Live trading is off for ${u.email}. Open orders aren't cancelled automatically — check Groww.` };
  });
}
