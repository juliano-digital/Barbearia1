export const bookingServices = [
  { name: "Corte masculino", durationMinutes: 45, price: 65 },
  { name: "Barba", durationMinutes: 35, price: 50 },
  { name: "Corte + Barba", durationMinutes: 75, price: 105 },
] as const;

export function getBookingService(name: string) {
  return bookingServices.find((service) => service.name === name);
}
