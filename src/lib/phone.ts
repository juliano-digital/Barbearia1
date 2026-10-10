export function toBrazilianE164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    throw new Error("O número informado tem 10 dígitos. Para WhatsApp brasileiro, informe DDD e os 9 dígitos do celular. Exemplo: (51) 99856-4723.");
  }
  throw new Error("Informe um celular com DDD e 9 dígitos, como (11) 99999-9999.");
}

export function getOtpErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("dígitos")) return error.message;
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : error instanceof Error
      ? error.message
      : "";
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("provider") ||
    normalizedMessage.includes("whatsapp") ||
    normalizedMessage.includes("sms")
  ) {
    return `O Supabase recusou o envio do código: ${message}. Verifique Authentication > Providers > Phone e configure um provedor de entrega WhatsApp.`;
  }
  if (normalizedMessage.includes("phone") || normalizedMessage.includes("number")) {
    return `O Supabase recusou esse número: ${message}. Use o formato internacional, por exemplo +5551998564723.`;
  }
  if (message) return `Não foi possível enviar o código: ${message}`;
  return "Não foi possível enviar o código. Verifique o número e a configuração de autenticação por telefone no Supabase.";
}
