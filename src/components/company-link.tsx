import { Fragment, type ReactNode } from "react";

// The company behind MyAlgoAgent. Every mention of it on the site links to its own website.
export const COMPANY_URL = "https://shagoonsoftech.com";
export const COMPANY_NAME = "Shagoon Softech Pvt. Ltd.";

export default function CompanyLink({ children = COMPANY_NAME, className = "", ...rest }: { children?: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    <a href={COMPANY_URL} target="_blank" rel="noopener" className={`underline-offset-2 hover:underline ${className}`} {...rest}>
      {children}
    </a>
  );
}

/** Text with every mention of the company ("Shagoon Softech", with or without "Pvt. Ltd.") turned into a link. */
export function withCompanyLinks(text: string): ReactNode {
  const parts = text.split(/(Shagoon Softech(?: Pvt\. Ltd\.)?)/g);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (i % 2 === 1 ? <CompanyLink key={i}>{p}</CompanyLink> : <Fragment key={i}>{p}</Fragment>));
}
