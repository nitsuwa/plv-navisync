import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState, type RefObject } from "react";
import { X } from "lucide-react";
import { AdminEventLayoutPreviewPage } from "../../pages/AdminEventLayoutPreviewPage";
import type { CampusEventOverlay } from "../map-builder/types";
import type { EventFeedbackPin } from "../../lib/eventFeedbackPins";
import { EventFurnitureSummary } from "./EventFurnitureSummary";

export function AdminEventMapPreviewDialog({ overlay, onClose, onAddFeedbackPin, returnFocusRef, reviewDraftNotice }: { overlay: CampusEventOverlay; onClose: () => void; onAddFeedbackPin?: (locationId: string, pin: EventFeedbackPin) => void; returnFocusRef?: RefObject<HTMLElement | null>; reviewDraftNotice?: string }) {
  const [pinDraft, setPinDraft] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () => { if (pinDraft) setConfirmClose(true); else onClose(); };
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/45 backdrop-blur-sm" />
    <Dialog.Content onCloseAutoFocus={event => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }} className="fixed inset-3 z-[111] flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-6 [@media(max-height:500px)]:inset-2">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 [@media(max-height:500px)]:py-2"><div className="min-w-0"><Dialog.Title className="text-sm font-bold">Requested map preview</Dialog.Title><p title={overlay.title} className="mt-1 line-clamp-2 break-words text-xs font-semibold [@media(max-height:500px)]:line-clamp-1">{overlay.title}</p><Dialog.Description className={pinDraft ? 'hidden' : "text-xs text-muted-foreground [@media(max-height:500px)]:hidden"}>{reviewDraftNotice ?? "Read-only · Close to return to your review."}</Dialog.Description></div><span className="hidden [@media(max-height:500px)]:inline-flex"><EventFurnitureSummary overlay={overlay} /></span><Dialog.Close aria-label="Close map preview" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border"><X className="h-4 w-4" /></Dialog.Close></div>
      {!pinDraft && <div className="shrink-0 border-b border-border px-4 py-2 [@media(max-height:500px)]:hidden"><EventFurnitureSummary overlay={overlay} /></div>}
      <div className="min-h-0 flex-1 overflow-hidden"><AdminEventLayoutPreviewPage previewOverlay={overlay} onClose={close} onAddFeedbackPin={onAddFeedbackPin} onPinDraftChange={setPinDraft} /></div>
    </Dialog.Content>
  </Dialog.Portal><AlertDialog.Root open={confirmClose} onOpenChange={setConfirmClose}><AlertDialog.Portal><AlertDialog.Overlay className="fixed inset-0 z-[130] bg-black/40" /><AlertDialog.Content className="fixed left-1/2 top-1/2 z-[131] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"><AlertDialog.Title className="font-bold">Discard this unsaved pin?</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm text-muted-foreground">Save the pin to your review before closing, or discard its position and comment.</AlertDialog.Description><div className="mt-5 flex flex-wrap justify-end gap-2"><AlertDialog.Cancel className="min-h-11 rounded-xl border border-border px-3 font-semibold">Keep pin draft</AlertDialog.Cancel><AlertDialog.Action onClick={onClose} className="min-h-11 rounded-xl bg-destructive px-3 font-semibold text-destructive-foreground">Discard pin and close</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root></Dialog.Root>;
}
