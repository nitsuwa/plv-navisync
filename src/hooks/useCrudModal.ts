import { useState, useCallback } from "react";

interface UseCrudModalState<TForm> {
  /** Whether the add/edit modal is open */
  isOpen: boolean;
  /** The item being edited, or null if adding a new one */
  editTarget: TForm | null;
  /** ID of item pending delete confirmation */
  deleteId: string | null;
}

interface UseCrudModalReturn<TForm> {
  isOpen: boolean;
  editTarget: TForm | null;
  deleteId: string | null;
  /** Open the modal to add a new item */
  openAdd: () => void;
  /** Open the modal to edit an existing item */
  openEdit: (item: TForm) => void;
  /** Close the modal */
  close: () => void;
  /** Prompt delete confirmation */
  confirmDelete: (id: string) => void;
  /** Cancel delete */
  cancelDelete: () => void;
  /** Confirm and execute delete */
  executeDelete: (onDelete: (id: string) => void) => void;
}

/**
 * Reusable hook for managing the CRUD modal lifecycle.
 * Handles add/edit/open/close/delete confirmation state.
 */
export function useCrudModal<TForm>(): UseCrudModalReturn<TForm> {
  const [isOpen, setIsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TForm | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    setEditTarget(null);
    setIsOpen(true);
  }, []);

  const openEdit = useCallback((item: TForm) => {
    setEditTarget(item);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setEditTarget(null);
  }, []);

  const confirmDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteId(null);
  }, []);

  const executeDelete = useCallback((onDelete: (id: string) => void) => {
    if (deleteId) {
      onDelete(deleteId);
      setDeleteId(null);
    }
  }, [deleteId]);

  return {
    isOpen,
    editTarget,
    deleteId,
    openAdd,
    openEdit,
    close,
    confirmDelete,
    cancelDelete,
    executeDelete,
  };
}
