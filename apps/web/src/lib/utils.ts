import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn 표준 유틸 — Tailwind 클래스 머지(중복 제거 + 조건 결합).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
