/** Room above the pet baseline: the actual menu, a small gap, and the artwork. */
export function petWindowLayout(menuHeight: number, selfScale: number, partnerScale: number) {
  const scale = Math.max(selfScale, partnerScale, 1);
  const menuBottom = Math.ceil(Math.max(159 * scale + 8, 174));
  return { menuBottom, height: 50 + menuBottom + Math.ceil(menuHeight) + 6 };
}
