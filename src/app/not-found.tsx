import Header from "@/components/header";
import Footer from "@/components/footer";
import SiteNotFound from "@/app/(site)/not-found";

// Root-level 404 (any unknown URL outside the site group). Wrapped in the
// site chrome so a visitor on a mistyped link still has navigation.
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <SiteNotFound />
      </main>
      <Footer />
    </>
  );
}
