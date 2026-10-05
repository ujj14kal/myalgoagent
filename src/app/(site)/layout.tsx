import "../site.css";
import SiteHeader from "@/components/site/site-header";
import SiteFooter from "@/components/site/site-footer";
import SiteMotion from "@/components/site/site-motion";
import { IconSprite } from "@/components/site/icons";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mk flex min-h-full flex-1 flex-col">
      <IconSprite />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
      <SiteMotion />
    </div>
  );
}
