import Link from "next/link";
import Image from "next/image";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 shrink-0 ${className}`}>
      <Image
        src="/brand/icon-mark.png"
        alt="MyAlgoAgent logo"
        width={36}
        height={36}
        priority
      />
      <span className="whitespace-nowrap text-base font-bold tracking-tight text-brand-primary sm:text-lg">
        MyAlgoAgent
      </span>
    </Link>
  );
}
