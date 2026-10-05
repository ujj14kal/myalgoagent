import SiteHero from "@/components/site/site-hero";

/** Inner marketing page header — the shared site hero (see components/site/site-hero.tsx). */
export default function PageHeader({
  eyebrow,
  title,
  description,
  crumbs,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  crumbs?: { href: string; label: string }[];
}) {
  return <SiteHero eyebrow={eyebrow} title={title} description={description} crumbs={crumbs} />;
}
