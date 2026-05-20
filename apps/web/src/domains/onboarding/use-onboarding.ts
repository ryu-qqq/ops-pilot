import { useCallback, useEffect, useState } from "react";

// localStorage 한 키만 — "가이드 본 적 있어 끔" 상태. 다시 켜면 재실행.
// 서버 데이터 아님이라 Query 불요 (CONVENTIONS.md 2: 서버상태만 Query).
const KEY = "opsp.onboarding.dismissed";

export function useOnboardingDismissed(): {
  dismissed: boolean;
  dismiss: () => void;
  reopen: () => void;
} {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(KEY) === "1";
  });

  // 탭간 동기화 — 다른 탭에서 가이드 켜고 끔 반영.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setDismissed(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(KEY, "1");
    setDismissed(true);
  }, []);
  const reopen = useCallback(() => {
    localStorage.removeItem(KEY);
    setDismissed(false);
  }, []);

  return { dismissed, dismiss, reopen };
}
