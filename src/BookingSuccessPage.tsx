import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarDays, Check, CircleX, Clock3, Scissors } from "lucide-react";
import { getSupabaseClient } from "./lib/supabase";

type Booking = {
  id: string;
  servico: string;
  data_agendamento: string;
  horario_agendamento: string;
  status: string;
  cancellation_reason?: string | null;
};

function parseBooking(value: unknown): Booking | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.servico !== "string" ||
    typeof candidate.data_agendamento !== "string" ||
    typeof candidate.horario_agendamento !== "string" ||
    typeof candidate.status !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    servico: candidate.servico,
    data_agendamento: candidate.data_agendamento,
    horario_agendamento: candidate.horario_agendamento,
    status: candidate.status,
  };
}

export default function BookingSuccessPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [cancellationFormOpen, setCancellationFormOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancellationNotice, setCancellationNotice] = useState("");
  const additionalBookingCount =
    location.state &&
    typeof location.state === "object" &&
    "additionalBookingCount" in location.state &&
    typeof location.state.additionalBookingCount === "number"
      ? location.state.additionalBookingCount
      : 0;
  const reminderStorageFailed = Boolean(
    location.state &&
    typeof location.state === "object" &&
    "reminderStorageFailed" in location.state &&
    location.state.reminderStorageFailed === true,
  );

  useEffect(() => {
    let active = true;

    async function loadBooking() {
      try {
        const { data, error: queryError } = await getSupabaseClient()
          .from("agendamentos")
          .select("id, servico, data_agendamento, horario_agendamento, status")
          .eq("id", id)
          .maybeSingle();
        if (queryError) throw queryError;

        const result = parseBooking(data);
        if (!result) {
          if (active) setError("Não encontramos este agendamento. Confira o link ou fale com a barbearia.");
          return;
        }
        if (active) setBooking(result);
      } catch {
        if (active) setError("Não foi possível carregar os dados do agendamento. Tente novamente.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (!id) {
      setError("O link de confirmação não contém um agendamento válido.");
      setLoading(false);
    } else {
      void loadBooking();
    }

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function handleCancelBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking) return;

    const reason = cancellationReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setCancellationError("Informe um motivo com pelo menos 5 caracteres.");
      return;
    }

    setCancelling(true);
    setCancellationError("");
    try {
      const { data, error: cancelError } = await getSupabaseClient().rpc(
        "cancelar_agendamento",
        { p_agendamento_id: booking.id, p_motivo: reason },
      );
      if (cancelError) throw cancelError;
      if (!data) {
        setCancellationError("O prazo de cancelamento terminou ou este agendamento já foi alterado.");
        return;
      }

      setBooking({ ...booking, status: "cancelado", cancellation_reason: reason });
      setCancellationFormOpen(false);
      setCancellationNotice("Agendamento cancelado.");
    } catch (cancelError) {
      if (
        cancelError &&
        typeof cancelError === "object" &&
        "message" in cancelError &&
        String(cancelError.message).includes("cancelar_agendamento")
      ) {
        setCancellationError("O banco ainda não foi atualizado para cancelamentos. Execute o SQL atualizado de agendamentos no Supabase.");
      } else {
        setCancellationError("Não foi possível cancelar agora. Atualize a página e tente novamente.");
      }
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#111110] px-5 text-[#f2eee7]">
        <p role="status">Confirmando seus dados...</p>
      </main>
    );
  }

  if (error || !booking) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#111110] px-5 text-[#f2eee7]">
        <section className="w-full max-w-md rounded-2xl border border-[#39342e] bg-[#1c1b19] p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Não foi possível abrir a confirmação</h1>
          <p className="mt-3 text-[#a9a29a]">{error || "Confira o link e tente novamente."}</p>
          <Link className="mt-6 inline-flex items-center gap-2 text-[#e3a343] underline" to="/">
            <ArrowLeft aria-hidden="true" className="size-4" /> Voltar ao início
          </Link>
        </section>
      </main>
    );
  }

  const date = parseISO(booking.data_agendamento);
  if (!isValid(date)) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#111110] px-5 text-[#f2eee7]">
        <p role="alert">A data deste agendamento está inválida. Entre em contato com a barbearia.</p>
      </main>
    );
  }

  const isConfirmed = booking.status === "confirmado";
  const appointmentTime = new Date(
    `${booking.data_agendamento}T${booking.horario_agendamento.slice(0, 5)}:00-03:00`,
  ).getTime();
  const canCancel =
    (booking.status === "confirmado" || booking.status === "pendente") &&
    Number.isFinite(appointmentTime) &&
    appointmentTime - now > 20 * 60 * 1000;

  return (
    <main className="grid min-h-screen place-items-center bg-[#111110] px-4 py-10 text-[#f2eee7] sm:px-6">
      <motion.section
        className="w-full max-w-xl rounded-3xl border border-[#39342e] bg-[#1c1b19] p-6 text-center shadow-[0_8px_24px_rgb(0_0_0/35%)] sm:p-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        aria-labelledby="success-title"
      >
        <span className={`mx-auto grid size-16 place-items-center rounded-full ${
          booking.status === "cancelado"
            ? "bg-red-500/15 text-red-300"
            : "bg-emerald-500/15 text-emerald-400"
        }`}>
          {booking.status === "cancelado"
            ? <CircleX aria-hidden="true" className="size-9 stroke-[2]" />
            : <Check aria-hidden="true" className="size-9 stroke-[2]" />}
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#e3a343]">
          Brasa Barbearia
        </p>
        {booking.status === "pendente" && (
          <div className="booking-success-toast" role="status">
            {booking.servico} · {format(date, "dd/MM/yyyy")} às{" "}
            {booking.horario_agendamento.slice(0, 5)}.
          </div>
        )}
        <h1 id="success-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {booking.status === "cancelado"
            ? "Agendamento cancelado."
            : isConfirmed ? "Agendamento confirmado!" : "Horário marcado."}
        </h1>
        <p className="mt-3 text-[#a9a29a]">
          {booking.status === "cancelado"
            ? "Este horário foi cancelado."
            : isConfirmed
              ? "Pronto! Seu horário está reservado. Esperamos você."
              : "Recebemos os dados do seu agendamento."}
        </p>

        <dl className="mt-8 grid gap-3 text-left sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-[#39342e] bg-[#111110] p-4 sm:col-span-2">
            <Scissors aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.5] text-[#e3a343]" />
            <div>
              <dt className="text-sm text-[#a9a29a]">Serviço</dt>
              <dd className="font-semibold">{booking.servico}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[#39342e] bg-[#111110] p-4">
            <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.5] text-[#e3a343]" />
            <div>
              <dt className="text-sm text-[#a9a29a]">Data</dt>
              <dd className="font-medium capitalize">
                {format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[#39342e] bg-[#111110] p-4">
            <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.5] text-[#e3a343]" />
            <div>
              <dt className="text-sm text-[#a9a29a]">Horário</dt>
              <dd className="font-medium">{booking.horario_agendamento.slice(0, 5)}</dd>
            </div>
          </div>
        </dl>

        <p className="mt-5 text-xs text-[#a9a29a]">
          Código do agendamento: {booking.id.slice(0, 8).toUpperCase()}
        </p>
        {booking.status === "cancelado" ? (
          <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-left">
            <p className="font-semibold text-red-200">Agendamento cancelado</p>
            {booking.cancellation_reason && (
              <p className="mt-2 text-sm text-[#a9a29a]">
                Motivo: {booking.cancellation_reason}
              </p>
            )}
          </div>
        ) : canCancel ? (
          <div className="mt-6 text-left">
            {!cancellationFormOpen ? (
              <button
                className="w-full rounded-xl border border-red-900/70 px-5 py-3 font-semibold text-red-200 transition hover:bg-red-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
                type="button"
                onClick={() => {
                  setCancellationError("");
                  setCancellationFormOpen(true);
                }}
              >
                Cancelar agendamento
              </button>
            ) : (
              <form
                className="grid gap-3 rounded-xl border border-[#39342e] bg-[#111110] p-4"
                onSubmit={(event) => void handleCancelBooking(event)}
              >
                <label className="grid gap-2 text-sm font-medium" htmlFor="cancellation-reason">
                  Motivo do cancelamento
                  <textarea
                    id="cancellation-reason"
                    className="min-h-24 resize-y rounded-lg border border-[#39342e] bg-[#1c1b19] p-3 text-[#f2eee7] placeholder:text-[#a9a29a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e3a343]"
                    value={cancellationReason}
                    onChange={(event) => setCancellationReason(event.target.value)}
                    minLength={5}
                    maxLength={500}
                    required
                    autoFocus
                    placeholder="Conte por que precisa cancelar"
                    aria-describedby={cancellationError ? "cancellation-error" : undefined}
                  />
                </label>
                <p className="text-xs text-[#a9a29a]">
                  O cancelamento deve ser solicitado pelo menos 20 minutos antes do horário marcado.
                </p>
                {cancellationError && (
                  <p id="cancellation-error" className="text-sm text-red-300" role="alert">
                    {cancellationError}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    className="rounded-lg border border-[#39342e] px-4 py-2 text-sm font-semibold text-[#a9a29a] hover:text-[#f2eee7]"
                    type="button"
                    disabled={cancelling}
                    onClick={() => setCancellationFormOpen(false)}
                  >
                    Voltar
                  </button>
                  <button
                    className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    type="submit"
                    disabled={cancelling || cancellationReason.trim().length < 5}
                  >
                    {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (booking.status === "confirmado" || booking.status === "pendente") ? (
          <p className="mt-6 text-sm text-[#a9a29a]" role="status">
            O prazo para cancelamento encerrou. O cancelamento deve ser solicitado pelo menos 20 minutos antes do horário marcado.
          </p>
        ) : null}
        {cancellationNotice && (
          <p className="mt-3 text-sm text-emerald-300" role="status">{cancellationNotice}</p>
        )}
        {reminderStorageFailed && (
          <p className="mt-3 text-sm text-[#e3a343]" role="status">
            Este navegador não conseguiu guardar os avisos dos agendamentos na página inicial.
          </p>
        )}
        {!reminderStorageFailed && additionalBookingCount > 0 && (
          <p className="mt-3 text-sm text-[#a9a29a]" role="status">
            Os outros {additionalBookingCount} comprovante(s) ficam disponíveis nos avisos da página inicial.
          </p>
        )}
        <Link
          className="mt-8 inline-flex min-h-12 items-center justify-center gap-3 rounded-xl border border-[#c9822b] bg-[#c9822b] px-6 font-semibold text-[#17120c] transition hover:-translate-y-0.5 hover:bg-[#e3a343] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e3a343]"
          to="/"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Voltar ao início
        </Link>
      </motion.section>
    </main>
  );
}
