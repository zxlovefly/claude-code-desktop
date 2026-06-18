import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = '确认删除', cancelLabel = '取消', danger = true, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => confirmBtnRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onConfirm, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-[#e5e6eb] w-96 max-w-[90vw] p-6 z-10">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? 'bg-[#e17055]/10' : 'bg-[#6c5ce7]/10'}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={danger ? '#e17055' : '#6c5ce7'} strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a2e]">{title}</h3>
            <p className="text-xs text-[#9a9ab0] mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs font-medium text-[#4a4a6a] hover:bg-[#f0f0f5] rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className={`px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${danger ? 'bg-[#e17055] hover:bg-[#d63031]' : 'bg-[#6c5ce7] hover:bg-[#5a4bd1]'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
