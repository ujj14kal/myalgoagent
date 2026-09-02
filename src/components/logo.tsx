import Link from "next/link";
import Image from "next/image";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 shrink-0 ${className}`}>
      <Image
        src="/brand/icon-mark.svg"
        alt="MyAlgoAgent logo"
        width={36}
        height={36}
        priority
      />
      <span className="text-lg font-normal tracking-tight text-brand-primary">
        MyAlgoAgent
      </span>
    </Link>
  );
}
