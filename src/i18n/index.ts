import { getStorageItem, setStorageItem } from "../utils/storage";
import { detect_language, is_lang, Lang } from "./languages";
import { STRINGS } from "./strings";

export * from "./languages";

export type StringKey = keyof typeof STRINGS;

type OneBase<K> = K extends `${infer B}_one` ? B : never;
type OtherBase<K> = K extends `${infer B}_other` ? B : never;

/** The base of a `_one`/`_other` pair, the only thing `tn` accepts. */
export type PluralKey = Extract<OneBase<StringKey>, OtherBase<StringKey>>;

const STORAGE_KEY = "language";

let current: Lang = (() => {
  // The module reaches the recorder worker too, and a worker has no localStorage.
  const stored =
    typeof localStorage === "undefined"
      ? null
      : getStorageItem<unknown>(STORAGE_KEY, null);
  return is_lang(stored) ? stored : detect_language();
})();

export const get_language = (): Lang => current;

/**
 * Switching language re-renders nothing on its own: React follows through the `language` state
 * App keeps alongside this, and every component reads its text with `t` on the way down.
 */
export function set_language(lang: Lang): void {
  current = lang;
  setStorageItem(STORAGE_KEY, lang);
}

/** A translated string, `{placeholder}` occurrences filled from `vars`. */
export function t(
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  const text: string = STRINGS[key][current];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * The `_one` or `_other` half of `key`, whichever `count` calls for, with `{count}` already
 * filled in. French counts zero as singular; the other three do not.
 */
export function tn(
  key: PluralKey,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const one = current === "fr" ? Math.abs(count) < 2 : count === 1;
  return t(`${key}${one ? "_one" : "_other"}` as StringKey, { count, ...vars });
}

/** Whether an assembled string is a key, for the few labels named after data rather than written out. */
export const is_string_key = (key: string): key is StringKey => key in STRINGS;
