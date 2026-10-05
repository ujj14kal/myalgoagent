import "./site.css";
import SiteHeader from "@/components/site/site-header";
import SiteFooter from "@/components/site/site-footer";
import SiteMotion from "@/components/site/site-motion";
import { IconSprite } from "@/components/site/icons";
import SiteNotFound from "@/app/(site)/not-found";

// Root-level 404 (any unknown URL outside the site group), in the same site chrome as every public page.
export default function NotFound() {
  return (
    <div className="mk flex min-h-full flex-1 flex-col">
      <IconSprite />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <SiteNotFound />
      </main>
      <SiteFooter />
      <SiteMotion />
    </div>
  );
}
