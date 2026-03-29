"use client";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "success" | "primary";
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /**
   * Sopra un altro modal (es. modifica membro): z-index più alto e backdrop che copre anche il pannello sottostante.
   */
  nested?: boolean;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  confirmVariant = "danger",
  loading = false,
  onCancel,
  onConfirm,
  nested = false,
}: Props) {
  if (!open) return null;

  const zBackdrop = nested ? 1060 : undefined;
  const zDialog = nested ? 1065 : undefined;

  return (
    <>
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        style={zDialog !== undefined ? { zIndex: zDialog } : undefined}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content turny-modal">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onCancel} disabled={loading} />
            </div>
            <div className="modal-body">
              <p className="mb-0">{message}</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel} disabled={loading}>
                {cancelLabel}
              </button>
              <button type="button" className={`btn btn-${confirmVariant} btn-sm`} onClick={onConfirm} disabled={loading}>
                {loading ? "Attendere..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        className={`modal-backdrop fade show${nested ? " turny-modal-backdrop-nested" : ""}`}
        style={zBackdrop !== undefined ? { zIndex: zBackdrop } : undefined}
        onClick={onCancel}
      />
    </>
  );
}
