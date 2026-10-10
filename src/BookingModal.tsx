import { useEffect, useRef, useState, type FormEvent } from "react";
import { format, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { getSupabaseClient } from "./lib/supabase";
import { bookingServices } from "./lib/bookingServices";

const allTimes = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const stepTitles = ["Serviço", "Data", "Horário", "Seus dados"];
const priceFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type BookingModalProps = {
  open: boolean;
  onClose: () => void;
};

function getFriendlyError(error: unknown) {
  if (error instanceof Error && error.message.includes("ainda não está configurado")) {
    return error.message;
  }
  return "Não foi possível concluir agora. Confira sua conexão e tente novamente.";
}

function isTimeInPast(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const timeSlot = new Date(date);
  timeSlot.setHours(hours, minutes, 0, 0);
  return timeSlot.getTime() <= Date.now();
}

export default function BookingModal({ open, onClose }: BookingModalProps) {
  const [step, setStep] = useState(0);
  const [service, setService] = useState("");
  const [date, setDate] = useState<Date>();
  const [occupiedTimes, setOccupiedTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [clientName, setClientName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open || !date) return;

    let isCurrentRequest = true;
    setAvailabilityLoading(true);
    setAvailabilityError(false);
    setErrorMessage("");
    setSelectedTime("");

    async function fetchOccupiedTimes() {
      try {
        setOccupiedTimes([]);
        const { data, error } = await getSupabaseClient()
          .from("agendamentos")
          .select("horario_agendamento")
          .eq("data_agendamento", format(date!, "yyyy-MM-dd"))
          .eq("status", "confirmado");

        if (error) throw error;
        if (isCurrentRequest) {
          setOccupiedTimes(data.map((booking) => booking.horario_agendamento.slice(0, 5)));
        }
      } catch (error) {
        if (isCurrentRequest) {
          setAvailabilityError(true);
          setErrorMessage(getFriendlyError(error));
        }
      } finally {
        if (isCurrentRequest) setAvailabilityLoading(false);
      }
    }

    void fetchOccupiedTimes();
    return () => {
      isCurrentRequest = false;
    };
  }, [date, open, availabilityRetry]);

  if (!open) return null;

  const blockedTimes = allTimes.filter((time) =>
    occupiedTimes.includes(time) || Boolean(date && isTimeInPast(date, time)),
  );
  const availableTimes = allTimes.filter((time) => !blockedTimes.includes(time));

  function closeModal() {
    if (submitting) return;
    setStep(0);
    setService("");
    setDate(undefined);
    setOccupiedTimes([]);
    setSelectedTime("");
    setAvailabilityError(false);
    setErrorMessage("");
    setClientName("");
    setWhatsapp("");
    onClose();
  }

  function goNext() {
    setErrorMessage("");
    setStep((current) => Math.min(current + 1, stepTitles.length - 1));
  }

  function handleDateSelect(selectedDate: Date | undefined) {
    if (!selectedDate) return;
    setDate(selectedDate);
    setStep(2);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date || !selectedTime || !service) return;

    setSubmitting(true);
    setErrorMessage("");
    try {
      const { data: booking, error } = await getSupabaseClient()
        .from("agendamentos")
        .insert({
          servico: service,
          nome_cliente: clientName.trim(),
          whatsapp: whatsapp.trim(),
          data_agendamento: format(date, "yyyy-MM-dd"),
          horario_agendamento: selectedTime,
        })
        .select("id")
        .single();

      if (error?.code === "23505") {
        setOccupiedTimes((times) => [...times, selectedTime]);
        setSelectedTime("");
        setStep(2);
        setErrorMessage("Esse horário acabou de ser reservado. Escolha outro disponível.");
        return;
      }
      if (error) throw error;
      const confirmationUrl = new URL(
        `/agendamento/comprovante/${encodeURIComponent(booking.id)}`,
        window.location.origin,
      );
      window.location.assign(confirmationUrl.toString());
    } catch (error) {
      setErrorMessage(error instanceof Error
        ? `Não foi possível salvar o agendamento: ${error.message}`
        : "Não foi possível salvar o agendamento. Confira sua conexão e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="booking-modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        ref={dialogRef}
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        <div className="booking-modal__urgency">⚡ Escolha seu horário e confirme seu agendamento</div>
        <header className="booking-modal__header">
          <div>
            <p className="eyebrow"><span /> AGENDAMENTO ONLINE</p>
            <h2 id="booking-modal-title">Seu próximo momento.</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="booking-modal__close"
            type="button"
            aria-label="Fechar agendamento"
            onClick={closeModal}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <>
            <ol className="booking-steps" aria-label="Etapas do agendamento">
              {stepTitles.map((title, index) => (
                <li className={index <= step ? "is-active" : ""} key={title}>
                  <span>{index + 1}</span>{title}
                </li>
              ))}
            </ol>

            <div className="booking-modal__content">
              {step === 0 && (
                <div>
                  <h3>O que vamos fazer hoje?</h3>
                  <p className="booking-modal__hint">Escolha o serviço ideal para você.</p>
                  <div className="booking-service-list">
                    {bookingServices.map((item) => (
                      <button
                        className={`booking-service${service === item.name ? " is-selected" : ""}`}
                        key={item.name}
                        type="button"
                        aria-pressed={service === item.name}
                        onClick={() => setService(item.name)}
                      >
                        <span><strong>{item.name}</strong><small>{item.durationMinutes} min</small></span>
                        <strong>{priceFormatter.format(item.price)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h3>Escolha o melhor dia</h3>
                  <p className="booking-modal__hint">Veja as datas e encontre um horário para você.</p>
                  <DayPicker
                    mode="single"
                    selected={date}
                    onSelect={handleDateSelect}
                    disabled={{ before: startOfToday() }}
                    locale={ptBR}
                    showOutsideDays
                    className="booking-calendar"
                    aria-label="Calendário de agendamento"
                    labels={{
                      labelNav: () => "Navegação do calendário",
                      labelNext: () => "Próximo mês",
                      labelPrevious: () => "Mês anterior",
                    }}
                  />
                </div>
              )}

              {step === 2 && (
                <div>
                  <h3>Horários disponíveis</h3>
                  <p className="booking-modal__hint">
                    {date && format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </p>
                  {availabilityLoading ? (
                    <div className="booking-loading" role="status"><span /> Consultando disponibilidade...</div>
                  ) : (
                    <>
                      <div className="booking-time-grid">
                        {allTimes.map((time) => {
                          const isOccupied = blockedTimes.includes(time);
                          return (
                            <button
                              className={`booking-time${selectedTime === time ? " is-selected" : ""}${isOccupied ? " is-occupied" : ""}`}
                              key={time}
                              type="button"
                              disabled={isOccupied || availabilityError}
                              aria-pressed={selectedTime === time}
                              onClick={() => {
                                setSelectedTime(time);
                                setErrorMessage("");
                              }}
                            >
                              {time}
                            </button>
                          );
                        })}
                      </div>
                      {!errorMessage && availableTimes.length === 0 && (
                        <p className="booking-modal__hint">Não há horários livres nessa data. Volte e escolha outro dia.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {step === 3 && (
                <form className="booking-client-form" onSubmit={handleSubmit}>
                  <h3>Como podemos te encontrar?</h3>
                  <p className="booking-modal__hint">
                    {service} · {date && format(date, "dd/MM/yyyy")} às {selectedTime}
                  </p>
                  <label htmlFor="booking-client-name">Seu nome</label>
                  <input
                    id="booking-client-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Como podemos te chamar?"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    required
                    maxLength={100}
                  />
                  <label htmlFor="booking-client-whatsapp">Telefone para contato</label>
                  <input
                    id="booking-client-whatsapp"
                    type="tel"
                    autoComplete="tel"
                    placeholder="(11) 99999-9999"
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(event.target.value)}
                    required
                    minLength={8}
                    maxLength={20}
                  />
                  <button className="button booking-modal__primary" type="submit" disabled={submitting}>
                    {submitting
                      ? <><span className="booking-spinner" /> Confirmando agendamento...</>
                      : <>Confirmar agendamento <span aria-hidden="true">↗</span></>}
                  </button>
                </form>
              )}

              {errorMessage && (
                <div className="booking-modal__error" role="alert">
                  <p>{errorMessage}</p>
                  {step === 2 && !availabilityLoading && (
                    <button
                      className="booking-modal__text-button"
                      type="button"
                      onClick={() => setAvailabilityRetry((attempt) => attempt + 1)}
                    >
                      Tentar novamente
                    </button>
                  )}
                </div>
              )}
            </div>

            {step !== 3 && (
              <footer className="booking-modal__footer">
                {step > 0 && (
                  <button
                    className="booking-modal__text-button"
                    type="button"
                    onClick={() => {
                      setErrorMessage("");
                      setStep((current) => current - 1);
                    }}
                  >
                    ← Voltar
                  </button>
                )}
                {step !== 1 && (
                  <button
                    className="button booking-modal__primary"
                    type="button"
                    disabled={step === 0 ? !service : step === 2 && (!selectedTime || availabilityLoading || Boolean(errorMessage))}
                    onClick={goNext}
                  >
                    Continuar <span aria-hidden="true">→</span>
                  </button>
                )}
              </footer>
            )}
        </>
      </section>
    </div>
  );
}
