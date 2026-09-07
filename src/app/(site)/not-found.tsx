import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <Image src="/brand/icon-mark.png" alt="" width={96} height={96} className="opacity-80" />
      <h1 className="mt-6 text-3xl font-bold text-brand-navy">Page not found</h1>
      <p className="mt-3 text-brand-navy/70">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have
        moved.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light"
        >
          Back to home
        </Link>
        <Link
          href="/product"
          className="rounded-full border border-brand-navy/15 px-6 py-3 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary"
        >
          Product overview
        </Link>
      </div>
    </div>
  );
}
