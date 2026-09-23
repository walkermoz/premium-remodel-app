import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty">
      <h1>Page not found.</h1>
      <p>Head back to your workspace to find your projects.</p>
      <Link className="button primary" href="/">
        Open workspace
      </Link>
    </main>
  );
}
