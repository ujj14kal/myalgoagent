// A list inside a card in a grid row. On wide screens it takes exactly the height the row already
// has (set by its neighbours, with a sensible minimum) and scrolls inside, instead of making the row
// taller and leaving the cards beside it hollow. On narrow screens, where cards stack, it's ordinary.
// The card around it should be `flex flex-col`.

const WIDE = {
  md: { outer: "md:relative md:min-h-[10rem] md:flex-1", inner: "md:absolute md:inset-0 md:overflow-y-auto md:pr-1" },
  lg: { outer: "lg:relative lg:min-h-[10rem] lg:flex-1", inner: "lg:absolute lg:inset-0 lg:overflow-y-auto lg:pr-1" },
} as const;

export default function FillList({ children, from = "lg", className = "" }: { children: React.ReactNode; /** The breakpoint where cards sit side by side. */ from?: keyof typeof WIDE; className?: string }) {
  return (
    <div className={`${WIDE[from].outer} ${className}`}>
      <div className={WIDE[from].inner}>{children}</div>
    </div>
  );
}
