export const LAST_BOOKING_STORAGE_KEY = "brasa:last-booking-id";

export function readBookingIds(value: string | null) {
  if (!value) return [];
  if (!value.trimStart().startsWith("[")) return [value];

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
    throw new Error("A lista local de agendamentos está inválida.");
  }
  return [...new Set(parsed)];
}

export function saveBookingIds(ids: string[]) {
  window.localStorage.setItem(LAST_BOOKING_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
}
