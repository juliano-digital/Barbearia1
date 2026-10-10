import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarDays, Check, Clock3, Scissors } from "lucide-react";
import { getSupabaseClient } from "./lib/supabase";

type Booking = {
  id: string;
  servico: string;
  data_agendamento: string;
  horario_agendamento: string;
  status: string;
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
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <main className="grid min-h-screen place-items-center bg-[#111110] px-4 py-10 text-[#f2eee7] sm:px-6">
      <motion.section
        className="w-full max-w-xl rounded-3xl border border-[#39342e] bg-[#1c1b19] p-6 text-center shadow-[0_8px_24px_rgb(0_0_0/35%)] sm:p-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        aria-labelledby="success-title"
      >
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
          <Check aria-hidden="true" className="size-9 stroke-[2]" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#e3a343]">
          Brasa Barbearia
        </p>
        <h1 id="success-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {isConfirmed ? "Agendamento confirmado!" : "Detalhes do agendamento"}
        </h1>
        <p className="mt-3 text-[#a9a29a]">
          {isConfirmed
            ? "Pronto! Seu horário está reservado. Esperamos você."
            : `Este agendamento está ${booking.status}.`}
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
        <Link
          className="mt-8 inline-flex min-h-12 items-center justify-center gap-3 rounded-xl border border-[#c9822b] bg-[#c9822b] px-6 font-semibold text-[#17120c] transition hover:-translate-y-0.5 hover:bg-[#e3a343]"
          to="/"
        >
          Voltar para o início <span aria-hidden="true">↗</span>
        </Link>
      </motion.section>
    </main>
  );
}
