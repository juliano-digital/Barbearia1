import { useEffect, useRef } from "react";

type ModalConfirmacaoProps = {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ModalConfirmacao({
  open,
  busy,
  onCancel,
  onConfirm,
}: ModalConfirmacaoProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
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
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div className="confirmation-backdrop">
      <div
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
      >
        <h2 id="confirmation-title">Confirmar exclusão</h2>
        <p id="confirmation-description">
          Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.
        </p>
        <div className="confirmation-dialog__actions">
          <button
            ref={cancelButtonRef}
            className="confirmation-dialog__cancel"
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Não, manter agendamento"
          >
            Não, manter
          </button>
          <button
            className="confirmation-dialog__delete"
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-label="Sim, excluir agendamento"
          >
            {busy ? "Excluindo..." : "Sim, excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}
