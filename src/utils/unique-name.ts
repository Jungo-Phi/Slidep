import { t } from "../i18n";

/** Next free name under the "X (copie)"/"X (copie 2)" convention — a duplicate never keeps its
 *  source's exact name outright, so the two are told apart at a glance in a list. */
export function unique_copy_name(
  base: string,
  takenNames: Iterable<string>,
): string {
  const taken = new Set(takenNames);
  let name = t("copy_of", { name: base });
  for (let n = 2; taken.has(name); n++) name = t("copy_of_n", { name: base, n });
  return name;
}

/** Next free "`base` N" name, N starting at 1 — a placeholder honest about being one, for an
 *  entry meant to be renamed right away rather than kept. */
export function unique_numbered_name(
  base: string,
  takenNames: Iterable<string>,
): string {
  const taken = new Set(takenNames);
  let n = 1;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
