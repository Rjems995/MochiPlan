import { LoaderCircle } from "lucide-react";
import { Logo, Mochi } from "./Artwork";

export function WorkspaceLoading({ loadError }: { loadError: boolean }) {
  return (
    <div className="app-loading">
      <Logo />
      {loadError ? (
        <>
          <h2>Your workspace couldn’t open.</h2>
          <p>Allow this site to use device storage, then try again.</p>
          <button className="button primary" onClick={() => location.reload()}>
            Try again
          </button>
        </>
      ) : (
        <>
          <Mochi flower />
          <p>Making a little room for your plans…</p>
          <LoaderCircle className="spin" size={20} />
        </>
      )}
    </div>
  );
}
