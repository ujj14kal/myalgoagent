import { Lock, Mail, MailWarning } from "lucide-react";

// One support conversation, oldest first. The same component renders the
// user's view (staff notes filtered out before it gets here) and the admin
// view (notes shown in yellow, with email delivery status on replies).

export type ThreadMessage = {
  id: string;
  author: "USER" | "STAFF" | "NOTE";
  authorName: string;
  body: string;
  createdAt: Date;
  emailStatus?: string | null;
};

const when = (d: Date) =>
  d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function SupportThread({ messages, viewer }: { messages: ThreadMessage[]; viewer: "user" | "staff" }) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = viewer === "user" ? m.author === "USER" : m.author !== "USER";
        const note = m.author === "NOTE";
        return (
          <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ring-1 ${
                note
                  ? "bg-amber-50 text-amber-950 ring-amber-200"
                  : m.author === "STAFF"
                    ? "bg-gradient-to-br from-brand-primary to-brand-primary-light text-white ring-transparent"
                    : "bg-white text-brand-navy ring-black/[0.06]"
              }`}
            >
              <p className={`mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold ${m.author === "STAFF" ? "text-white/75" : "text-brand-navy/50"}`}>
                {note && <Lock size={11} />}
                {note ? `Internal note · ${m.authorName}` : m.author === "STAFF" ? `MyAlgoAgent support · ${m.authorName.split(" ")[0]}` : m.authorName}
                <span className="font-normal opacity-80">· {when(m.createdAt)}</span>
                {viewer === "staff" && m.author === "STAFF" && m.emailStatus && (
                  <span className={`ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] ${m.emailStatus === "sent" ? "bg-white/20" : m.emailStatus === "skipped" ? "bg-white/10" : "bg-brand-sell text-white"}`}>
                    {m.emailStatus === "sent" ? <Mail size={10} /> : <MailWarning size={10} />}
                    {m.emailStatus === "sent" ? "emailed" : m.emailStatus === "skipped" ? "in-app only" : "email failed"}
                  </span>
                )}
              </p>
              <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
