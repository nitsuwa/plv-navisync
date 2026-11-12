import { confirmAction } from './confirmAction';
import { resolveUnsavedForms } from '../hooks/useUnsavedFormGuard';

/** Resolve user intent and drafts before any authenticated state is cleared. */
export async function confirmSignOut(): Promise<boolean> {
  if (!await confirmAction({ title: 'Sign out?', message: 'You will need to sign in again to access your account.', confirmLabel: 'Sign out' })) return false;
  return resolveUnsavedForms();
}
