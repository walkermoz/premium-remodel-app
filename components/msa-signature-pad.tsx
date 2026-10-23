"use client";

import { useRef, useState } from "react";
import type { SignatureStroke } from "@/lib/types";

export function MsaSignatureImage({
  strokes,
  label = "Signature",
}: {
  strokes: SignatureStroke[];
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 600 160"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={{ width: "100%", maxWidth: 440, height: 105, color: "#142c3e" }}
    >
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={stroke.map(([x, y]) => `${x * 600},${y * 160}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export default function MsaSignaturePad({
  onChange,
  disabled = false,
}: {
  onChange: (strokes: SignatureStroke[]) => void;
  disabled?: boolean;
}) {
  const pad = useRef<SVGSVGElement>(null);
  const pointer = useRef<number | null>(null);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const change = (next: SignatureStroke[]) => {
    setStrokes(next);
    onChange(next.filter((stroke) => stroke.length > 1));
  };
  const point = (
    event: React.PointerEvent<SVGSVGElement>,
  ): [number, number] => {
    const bounds = pad.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    ];
  };
  return (
    <div>
      <svg
        ref={pad}
        viewBox="0 0 600 160"
        preserveAspectRatio="none"
        role="img"
        aria-label="Draw your signature"
        style={{
          display: "block",
          width: "100%",
          maxWidth: 540,
          height: 125,
          background: "#fff",
          border: "1px solid #a6b8c5",
          borderRadius: 8,
          touchAction: "none",
        }}
        onPointerDown={(event) => {
          if (disabled || pointer.current !== null) return;
          event.preventDefault();
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          change([...strokes, [point(event)]]);
        }}
        onPointerMove={(event) => {
          if (disabled || pointer.current !== event.pointerId) return;
          event.preventDefault();
          const next = point(event);
          const last = strokes.at(-1);
          if (!last || last.length >= 1000 || strokes.length > 40) return;
          const previous = last.at(-1)!;
          if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) < 0.0015)
            return;
          change([...strokes.slice(0, -1), [...last, next]]);
        }}
        onPointerUp={(event) => {
          if (pointer.current !== event.pointerId) return;
          pointer.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          change(strokes.filter((stroke) => stroke.length > 1));
        }}
        onPointerCancel={(event) => {
          if (pointer.current === event.pointerId) {
            pointer.current = null;
            change(strokes.filter((stroke) => stroke.length > 1));
          }
        }}
      >
        {strokes.map((stroke, index) => (
          <polyline
            key={index}
            points={stroke.map(([x, y]) => `${x * 600},${y * 160}`).join(" ")}
            fill="none"
            stroke="#172e3e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <button
        type="button"
        disabled={disabled}
        onClick={() => change([])}
        style={{ marginTop: 6, color: "#276fac", fontSize: 13 }}
      >
        Clear signature
      </button>
    </div>
  );
}
