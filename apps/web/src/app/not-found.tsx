import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d0e11",
        color: "#e8e8ea",
        fontFamily: "var(--app-font), system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <p
          style={{
            fontSize: 64,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #d59ee8, #9b51e0)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          404
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "12px 0 8px" }}>
          This board doesn&apos;t exist
        </h1>
        <p style={{ fontSize: 14, color: "#a6a7ab", margin: "0 0 24px", lineHeight: 1.6 }}>
          The link may be expired, or the board was moved or deleted.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            borderRadius: 10,
            background: "var(--accent, #9b51e0)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to Crecoard
        </Link>
      </div>
    </main>
  );
}
