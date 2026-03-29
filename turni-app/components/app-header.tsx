import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "@/components/auth-buttons";

type Props = {
  isAuthenticated: boolean;
  displayName?: string | null;
};

export function AppHeader({ isAuthenticated, displayName }: Props) {
  return (
    <header className="d-flex justify-content-between align-items-center gap-3 flex-wrap pb-3">
      <Link href="/" className="d-inline-flex align-items-center" aria-label="Vai alla home Turny">
        <Image src="/turny_logo.svg" alt="Turny" width={250} height={72} priority />
      </Link>
      {isAuthenticated ? (
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="small text-secondary">
            Benvenuto <strong>{displayName || "utente"}</strong>
          </span>
          <SignOutButton />
        </div>
      ) : (
        <Link href="/login" className="btn btn-success">
          Login
        </Link>
      )}
    </header>
  );
}
