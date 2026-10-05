/**
 * Fades its content up on scroll. Driven by the marketing site's motion runtime (data-rise, see
 * components/site/motion.ts) so every page reveals the same way; with JS off or reduced motion the
 * content is simply visible.
 */
export default function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-rise className={className}>
      {children}
    </div>
  );
}
