// @vivafolio/block-core
// Single entry for shared types, utils, and message shapes to avoid drift.
// 5) Utils (kept tiny; framework-agnostic)
export const getByPath = (obj, path) => path.split(".").reduce((cur, k) => (cur == null ? cur : cur[k]), obj);
export const setByPath = (obj, path, value) => {
    const parts = path.split(".");
    const target = { ...(obj || {}) };
    let cur = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        cur[key] = typeof cur[key] === "object" && cur[key] != null ? { ...cur[key] } : {};
        cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
    return target;
};
