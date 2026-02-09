import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isString = (value: unknown): value is string =>
  typeof value === "string";

export const isNonEmptyString = (value: unknown): value is string =>
  isString(value) && value.trim().length > 0;

export const stringOrNull = (value: unknown): string | null =>
  isNonEmptyString(value) ? value.trim() : null;

export const stringOrFallback = (value: unknown, fallback: string): string =>
  isNonEmptyString(value) ? value.trim() : fallback;

export const errorMessage = (
  error: unknown,
  fallback = "Unexpected error"
): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
};
