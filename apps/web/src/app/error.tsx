"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
        <p style={{ fontSize: 40, margin: 0 }}>⚠️</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "12px 0 8px" }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: "#a6a7ab", margin: "0 0 24px", lineHeight: 1.6 }}>
          An unexpected error occurred. Your boards are safe — try again.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "var(--accent, #9b51e0)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid #2a2b30",
              background: "transparent",
              color: "#a6a7ab",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Go home
          </button>
        </div>
      </div>
    </main>
  );
}
