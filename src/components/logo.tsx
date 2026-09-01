import Link from "next/link";
import Image from "next/image";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 shrink-0 ${className}`}>
      <Image
        src="/brand/icon-mark.svg"
        alt="my ALGO agent logo"
        width={36}
        height={36}
        priority
      />
      <span className="text-lg font-semibold tracking-tight">
        <span className="font-normal text-brand-navy">my</span>{" "}
        <span className="font-extrabold text-brand-primary">ALGO</span>{" "}
        <span className="font-normal text-brand-navy">agent</span>
      </span>
    </Link>
  );
}
