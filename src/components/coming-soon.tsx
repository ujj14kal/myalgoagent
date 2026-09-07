import RobotMascot from "@/components/robot/robot-mascot";

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-navy/15 bg-white text-center">
      <RobotMascot pose="thinking" size={80} />
      <h1 className="text-xl font-bold text-brand-navy">{title}</h1>
      <p className="mt-1 max-w-sm text-sm text-brand-navy/60">
        This section is being built next. Your account and session are
        already working — this page just doesn&rsquo;t have functionality
        wired up yet.
      </p>
    </div>
  );
}
