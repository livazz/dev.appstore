'use client';

import { useFormStatus } from 'react-dom';
import { unlinkAction } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-bg disabled:opacity-60"
    >
      {pending ? 'Suppression…' : 'Délier'}
    </button>
  );
}

export function UnlinkButton({ linkId, gameName }: { linkId: string; gameName: string }) {
  return (
    <form
      action={unlinkAction}
      onSubmit={(e) => {
        if (!window.confirm(`Délier votre compte ${gameName} ? Vous devrez le lier à nouveau avant votre prochain achat.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="linkId" value={linkId} />
      <Submit />
    </form>
  );
}
