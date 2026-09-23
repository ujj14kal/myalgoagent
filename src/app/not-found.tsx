// Root-level 404 for routes outside the (site) group (e.g. an unknown
// /app/* path) — same page, reused rather than duplicated.
export { default } from "@/app/(site)/not-found";
