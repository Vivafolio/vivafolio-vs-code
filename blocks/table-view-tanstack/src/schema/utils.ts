
export const uid = () => Math.random().toString(36).slice(2, 9);

export const getByPath = (obj: any, path: string) =>
  path.split(".").reduce((acc, k) => acc?.[k], obj);

export const setByPath = (obj: any, path: string, val: any) => {
  const root = { ...(obj ?? {}) };
  const parts = path.split(".");
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = { ...(cur[parts[i]] ?? {}) };
    cur = cur[parts[i]];
  }
  cur[parts.at(-1)!] = val;
  return root;
};

import type { ColumnType } from "./types";
export function coerceValue(to: ColumnType, value: any, options?: { id: string; label: string }[]) {
  switch (to) {
    case "text": return value == null ? "" : String(value);
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "checkbox": return Boolean(value);
    case "date": {
      const d = value instanceof Date ? value : new Date(value);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    case "select": {
      if (!options?.length) return null;
      const label = String(value ?? "").toLowerCase();
      const match = options.find(o => o.label.toLowerCase() === label);
      return match ? match.id : null;
    }
    case "person":
    case "relation": return value ?? null;
    case "rollup":
    case "formula": return undefined;
  }
}
