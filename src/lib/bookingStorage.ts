export const LAST_BOOKING_STORAGE_KEY = "brasa:last-booking-id";
const BOOKING_RECEIPT_CONTACT_KEY = "brasa:booking-receipt-contact:";

export type BookingReceiptContact = {
  nome_cliente: string;
  whatsapp: string;
};

export function saveBookingReceiptContacts(ids: string[], contact: BookingReceiptContact) {
  for (const id of ids) {
    window.sessionStorage.setItem(
      `${BOOKING_RECEIPT_CONTACT_KEY}${id}`,
      JSON.stringify(contact),
    );
  }
}

export function readBookingReceiptContact(id: string): BookingReceiptContact | null {
  const value = window.sessionStorage.getItem(`${BOOKING_RECEIPT_CONTACT_KEY}${id}`);
  if (!value) return null;

  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("nome_cliente" in parsed) ||
    typeof parsed.nome_cliente !== "string" ||
    !("whatsapp" in parsed) ||
    typeof parsed.whatsapp !== "string"
  ) {
    throw new Error("Os dados de contato salvos para o comprovante estão inválidos.");
  }

  return {
    nome_cliente: parsed.nome_cliente,
    whatsapp: parsed.whatsapp,
  };
}

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
