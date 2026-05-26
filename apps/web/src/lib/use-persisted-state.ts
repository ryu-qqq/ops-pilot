import { useCallback, useState } from "react";

/** sessionStorage — 탭 전환·새로고침까지 UI 선택 유지 (브라우저 탭 닫으면 초기화). */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  const setPersisted = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          // quota / private mode — memory only
        }
        return next;
      });
    },
    [key],
  );

  return [state, setPersisted];
}
