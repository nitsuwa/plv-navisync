import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  action?: () => Promise<void>;
}

let pending = false;

/** A second click cannot attach another mutation to an existing decision. */
export function confirmAction(options: ConfirmationOptions): Promise<boolean> {
  if (pending || typeof document === 'undefined') return Promise.resolve(false);
  pending = true;
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      pending = false;
      resolve(confirmed);
    };
    let busy = false;
    let error = '';
    const render = () => root.render(createElement(ConfirmDialog, {
      ...options, message: error ? `${options.message}\n\n${error}` : options.message,
      open: true, busy, zIndexClassName: 'z-[300]',
      onConfirm: async () => {
        if (busy) return;
        if (!options.action) { finish(true); return; }
        busy = true; error = ''; render();
        try { await options.action(); finish(true); }
        catch (cause) { busy = false; error = cause instanceof Error ? cause.message : 'The action failed. Please retry.'; render(); }
      },
      onCancel: () => { if (!busy) finish(false); },
    }));
    render();
  });
}
