"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Fixes blank space anywhere in the app, by itself, as soon as it appears (on load, on a new page, when a list
// gets longer or shorter, when the window is resized). Two things leave a hollow area on a page of cards:
//
//  1. A column of cards beside a taller card: the column ends early and the rest of the row is empty.
//     The last card in the column grows to the row's height.
//  2. A card stretched taller than its own content (a short empty message beside a long list): the short
//     content is centred in the card instead of hanging at the top of a tall hollow box.
//
// Long lists that should scroll rather than stretch a row use <FillList> (components/ui/fill-list.tsx); this
// catches everything else, including pages written later. Opt a block out with data-no-balance.

const MIN_GAP = 28; // px of empty space before a column's last card is grown
const MIN_HOLLOW = 72; // px of empty space inside a card before its short content is centred
const SHORT_BODY = 180; // px: content shorter than this (an empty message, a single line) is centred; lists stay at the top

const isEl = (n: Element | null): n is HTMLElement => !!n && n instanceof HTMLElement;

function balance(root: HTMLElement) {
  const grids = [root, ...Array.from(root.querySelectorAll<HTMLElement>("[class*='grid']"))];
  for (const grid of grids) {
    if (grid.closest("[data-no-balance]")) continue;
    if (getComputedStyle(grid).display !== "grid") continue;
    for (const cell of Array.from(grid.children)) {
      if (!isEl(cell) || cell.hasAttribute("data-no-balance")) continue;
      const cs = getComputedStyle(cell);
      if (cell.classList.contains("surface")) {
        centreHollowCard(cell);
      } else if (cs.display === "flex" && cs.flexDirection === "column") {
        growLastCard(cell);
      }
    }
  }
}

function growLastCard(column: HTMLElement) {
  const cards = Array.from(column.children).filter((c): c is HTMLElement => isEl(c) && c.classList.contains("surface"));
  const last = cards.at(-1);
  if (!last || last.hasAttribute("data-no-balance")) return;
  const spare = column.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
  if (spare < MIN_GAP) return;
  last.style.flexGrow = "1";
  last.style.display = "flex";
  last.style.flexDirection = "column";
  centreHollowCard(last);
}

function centreHollowCard(card: HTMLElement) {
  const kids = Array.from(card.children).filter(isEl);
  if (kids.length === 0) return;
  const body = kids.at(-1)!;
  const cs = getComputedStyle(card);
  const innerBottom = card.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom || "0");
  const spare = innerBottom - body.getBoundingClientRect().bottom;
  if (spare < MIN_HOLLOW) return;
  // Only a short body (an empty-state message or a lone line) is centred; a list or table stays at the top.
  if (kids.length < 2 || body.getBoundingClientRect().height > SHORT_BODY || body.querySelector("table, ul li:nth-child(3), canvas")) return;
  card.style.display = "flex";
  card.style.flexDirection = "column";
  body.style.marginBlock = "auto";
}

export default function SpaceBalancer() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-app-main]") ?? document.querySelector<HTMLElement>("main");
    if (!root) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => balance(root));
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [pathname]);
  return null;
}
