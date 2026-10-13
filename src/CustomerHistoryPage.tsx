import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./lib/supabase";
import { getOtpErrorMessage, toBrazilianE164 } from "./lib/phone";

type Booking = {
  id: string;
  servico: string;
  nome_cliente: string;
  whatsapp: string;
  data_agendamento: string;
  horario_agendamento: string;
  status: string;
  cancellation_reason: string | null;
};

function canCancelBooking(booking: Booking, now: number) {
  if (booking.status !== "confirmado") return false;
  const appointmentTime = new Date(
    `${booking.data_agendamento}T${booking.horario_agendamento.slice(0, 5)}:00-03:00`,
  ).getTime();
  return Number.isFinite(appointmentTime) && appointmentTime - now > 20 * 60 * 1000;
}

function formatBookingStatus(status: string) {
  return status === "cancelado" ? "Cancelado" : status === "confirmado" ? "Confirmado" : status;
}

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message.includes("WhatsApp")) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (message.includes("permission denied")) {
      return "O banco ainda não está atualizado. Execute novamente o SQL de agendamentos no Supabase.";
    }
  }
  return "Não foi possível carregar sua conta. Tente novamente.";
}

function friendlyCancellationError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (message.includes("permission denied") || message.includes("row-level security")) {
      return "O banco ainda não está atualizado para cancelamentos. Execute novamente o SQL de agendamentos no Supabase.";
    }
  }
  return "Não foi possível cancelar agora. Tente novamente ou entre em contato com a barbearia.";
}

export default function CustomerHistoryPage() {
  const location = useLocation();
  const bookingId = new URLSearchParams(location.search).get("agendamento");
  const [session, setSession] = useState<Session | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [cancellationTarget, setCancellationTarget] = useState<Booking | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [now, setNow] = useState(Date.now());
  const [cancellationError, setCancellationError] = useState("");
  const [error, setError] = useState("");

  async function loadHistory(userId: string) {
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from("agendamentos")
        .select("id, servico, nome_cliente, whatsapp, data_agendamento, horario_agendamento, status, cancellation_reason")
        .eq("user_id", userId)
        .order("data_agendamento", { ascending: false })
        .order("horario_agendamento", { ascending: false });
      if (queryError) throw queryError;
      setBookings(data);
      if (bookingId && !data.some((booking) => booking.id === bookingId)) {
        setError("Não encontramos esse agendamento no histórico do WhatsApp verificado.");
      }
    } catch (queryError) {
      setError(friendlyError(queryError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(friendlyError(sessionError));
        setLoading(false);
        return;
      }
      const currentSession = data.session;
      setSession(currentSession);
      if (currentSession) void loadHistory(currentSession.user.id);
      else setLoading(false);
    }).catch((sessionError: unknown) => {
      if (active) {
        setError(friendlyError(sessionError));
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) {
        window.setTimeout(() => {
          if (active) void loadHistory(nextSession.user.id);
        }, 0);
      } else {
        setBookings([]);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const normalized = toBrazilianE164(phone);
      const { error: otpError } = await getSupabaseClient().auth.signInWithOtp({
        phone: normalized,
        options: { channel: "whatsapp", shouldCreateUser: true },
      });
      if (otpError) throw otpError;
      setVerifiedPhone(normalized);
      setOtpSent(true);
    } catch (requestError) {
      setError(getOtpErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const { data, error: verifyError } = await getSupabaseClient().auth.verifyOtp({
        phone: verifiedPhone,
        token: otp.trim(),
        type: "sms",
      });
      if (verifyError) {
        setError("Código inválido ou expirado. Solicite outro e tente novamente.");
        return;
      }
      if (!data.session) throw new Error("Não foi possível iniciar sua sessão.");
      setSession(data.session);
      await loadHistory(data.session.user.id);
    } catch (verifyError) {
      setError(friendlyError(verifyError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    const { error: signOutError } = await getSupabaseClient().auth.signOut();
    if (signOutError) setError("Não foi possível sair da conta. Tente novamente.");
    else {
      setSession(null);
      setBookings([]);
      setOtpSent(false);
      setOtp("");
    }
  }

  function openCancellationDialog(booking: Booking) {
    if (!session || !canCancelBooking(booking, Date.now())) return;
    setCancellationTarget(booking);
    setCancellationReason("");
    setCancellationError("");
  }

  async function handleCancelBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const booking = cancellationTarget;
    const reason = cancellationReason.trim();
    if (!session || !booking || !canCancelBooking(booking, Date.now())) return;
    if (reason.length < 5) {
      setCancellationError("Explique o motivo do cancelamento com pelo menos 5 caracteres.");
      return;
    }

    setCancellingId(booking.id);
    setCancellationError("");
    try {
      const { data, error: cancelError } = await getSupabaseClient()
        .from("agendamentos")
        .update({ status: "cancelado", cancellation_reason: reason })
        .eq("id", booking.id)
        .eq("user_id", session.user.id)
        .eq("status", "confirmado")
        .select("id")
        .maybeSingle();

      if (cancelError) throw cancelError;
      if (!data) {
        setCancellationError("Não foi possível cancelar. O prazo pode ter expirado ou o agendamento já foi alterado.");
        return;
      }
      setBookings((current) => current.map((item) =>
        item.id === booking.id ? { ...item, status: "cancelado", cancellation_reason: reason } : item,
      ));
      setCancellationTarget(null);
      setCancellationReason("");
    } catch (cancelError) {
      setCancellationError(friendlyCancellationError(cancelError));
    } finally {
      setCancellingId("");
    }
  }

  const selectedBooking = bookings.find((booking) => booking.id === bookingId);

  return (
    <main className="customer-page">
      <header className="admin-header">
        <Link className="wordmark" to="/" aria-label="Brasa Barbearia — página inicial">
          <span className="wordmark__icon" aria-hidden="true">B.</span>
          <span className="wordmark__text">BRASA<span>BARBEARIA</span></span>
        </Link>
        {session && (
          <button className="admin-logout" type="button" onClick={() => void handleSignOut()}>
            Sair
          </button>
        )}
      </header>

      <section className="customer-content">
        <p className="eyebrow"><span /> ÁREA DO CLIENTE</p>
        {selectedBooking ? (
          <div className="customer-confirmation" aria-live="polite">
            <span className="booking-success__icon" aria-hidden="true">
              {selectedBooking.status === "cancelado" ? "×" : "✓"}
            </span>
            <h1>
              {selectedBooking.status === "cancelado"
                ? "Agendamento cancelado"
                : `Agendamento confirmado, ${selectedBooking.nome_cliente.split(" ")[0]}!`}
            </h1>
            <p className="customer-confirmation__lead">
              {selectedBooking.status === "cancelado"
                ? "Este agendamento foi cancelado. Confira os dados:"
                : "Sua reserva foi salva. Estes são os detalhes:"}
            </p>
            <dl className="customer-booking-details">
              <div><dt>Serviço</dt><dd>{selectedBooking.servico}</dd></div>
              <div>
                <dt>Data</dt>
                <dd>{format(parseISO(selectedBooking.data_agendamento), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</dd>
              </div>
              <div><dt>Horário</dt><dd>{selectedBooking.horario_agendamento.slice(0, 5)}</dd></div>
              <div><dt>WhatsApp</dt><dd>{selectedBooking.whatsapp}</dd></div>
              <div><dt>Status</dt><dd>{formatBookingStatus(selectedBooking.status)}</dd></div>
              {selectedBooking.cancellation_reason && (
                <div><dt>Motivo do cancelamento</dt><dd>{selectedBooking.cancellation_reason}</dd></div>
              )}
            </dl>
            {cancellationError && <p className="admin-error" role="alert">{cancellationError}</p>}
            <p className="customer-cancellation-note">
              O cancelamento pode ser feito até 20 minutos antes do horário marcado.
            </p>
            <button
              className="customer-cancel-button"
              type="button"
              disabled={!canCancelBooking(selectedBooking, now) || cancellingId === selectedBooking.id}
              onClick={() => openCancellationDialog(selectedBooking)}
            >
              {cancellingId === selectedBooking.id
                ? "Cancelando..."
                : selectedBooking.status === "cancelado"
                  ? "Agendamento cancelado"
                  : canCancelBooking(selectedBooking, now)
                    ? "Cancelar agendamento"
                    : "Prazo para cancelamento encerrado"}
            </button>
            <Link className="button customer-primary-link" to="/minha-conta">Ver meu histórico completo</Link>
          </div>
        ) : (
          <>
            <h1>Meu histórico</h1>
            <p className="customer-content__intro">
              Acesse com o número usado no agendamento. Enviaremos um código para confirmar sua identidade.
            </p>
          </>
        )}

        {loading ? (
          <div className="admin-loading" role="status"><span className="booking-spinner" /> Carregando seu histórico...</div>
        ) : session ? (
          <>
            {!selectedBooking && error && <p className="admin-error" role="alert">{error}</p>}
            {!selectedBooking && cancellationError && (
              <p className="admin-error" role="alert">{cancellationError}</p>
            )}
            {bookings.length === 0 ? (
              <div className="admin-empty">
                <span aria-hidden="true">◷</span>
                <h2>Nenhum agendamento encontrado</h2>
                <p>Agendamentos confirmados pelo seu WhatsApp aparecerão aqui.</p>
              </div>
            ) : (
              <section className="customer-history-list" aria-label="Histórico de agendamentos">
                <h2>Seus agendamentos</h2>
                {bookings.map((booking) => (
                  <article
                    className={`customer-history-card${booking.id === bookingId ? " is-current" : ""}`}
                    key={booking.id}
                  >
                    <div>
                      <strong>{booking.servico}</strong>
                      <span>{format(parseISO(booking.data_agendamento), "dd/MM/yyyy", { locale: ptBR })} · {booking.horario_agendamento.slice(0, 5)}</span>
                    </div>
                    <span className={`admin-status admin-status--${booking.status}`}>
                      {formatBookingStatus(booking.status)}
                    </span>
                    {canCancelBooking(booking, now) && (
                      <button
                        className="customer-cancel-button customer-cancel-button--compact"
                        type="button"
                        disabled={cancellingId === booking.id}
                        onClick={() => openCancellationDialog(booking)}
                      >
                        {cancellingId === booking.id ? "Cancelando..." : "Cancelar"}
                      </button>
                    )}
                  </article>
                ))}
              </section>
            )}
          </>
        ) : (
          <form className="customer-auth-form" onSubmit={otpSent ? handleVerifyCode : handleRequestCode}>
            <label htmlFor="customer-phone">WhatsApp com DDD</label>
            <input
              id="customer-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={otpSent}
              required
            />
            {otpSent && (
              <>
                <p className="booking-modal__hint">Enviamos um código pelo WhatsApp para {verifiedPhone}.</p>
                <label htmlFor="customer-otp">Código de verificação</label>
                <input
                  id="customer-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  minLength={4}
                  maxLength={8}
                  required
                />
              </>
            )}
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="button admin-submit" type="submit" disabled={submitting}>
              {submitting ? "Aguarde..." : otpSent ? "Verificar e abrir histórico" : "Enviar código pelo WhatsApp"}
            </button>
            {otpSent && (
              <button
                className="booking-modal__text-button"
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                  setError("");
                }}
              >
                Corrigir número
              </button>
            )}
          </form>
        )}
      </section>
      {cancellationTarget && (
        <div
          className="customer-cancel-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !cancellingId) {
              setCancellationTarget(null);
              setCancellationError("");
            }
          }}
        >
          <section
            className="customer-cancel-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-cancel-title"
            aria-describedby="customer-cancel-description"
          >
            <p className="eyebrow"><span /> CANCELAMENTO</p>
            <h2 id="customer-cancel-title">Por que precisa cancelar?</h2>
            <p id="customer-cancel-description">
              Conte brevemente o motivo. A solicitação só será enviada depois que você informar essa explicação.
            </p>
            <form onSubmit={(event) => void handleCancelBooking(event)}>
              <label htmlFor="customer-cancel-reason">Motivo do cancelamento</label>
              <textarea
                id="customer-cancel-reason"
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value.slice(0, 500))}
                placeholder="Escreva o motivo (mínimo de 5 caracteres)"
                minLength={5}
                maxLength={500}
                rows={4}
                required
                autoFocus
                disabled={Boolean(cancellingId)}
              />
              <span className="customer-cancel-dialog__count">{cancellationReason.length}/500</span>
              {cancellationError && <p className="admin-error" role="alert">{cancellationError}</p>}
              <div className="customer-cancel-dialog__actions">
                <button
                  className="customer-cancel-dialog__back"
                  type="button"
                  disabled={Boolean(cancellingId)}
                  onClick={() => {
                    setCancellationTarget(null);
                    setCancellationError("");
                  }}
                >
                  Voltar
                </button>
                <button
                  className="customer-cancel-button"
                  type="submit"
                  disabled={Boolean(cancellingId) || cancellationReason.trim().length < 5}
                >
                  {cancellingId === cancellationTarget.id ? "Enviando..." : "Confirmar cancelamento"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
