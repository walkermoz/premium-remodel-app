"use client";

import { useRef, useState } from "react";
import type { SignatureStroke } from "@/lib/types";
import styles from "./msa-signature-pad.module.css";

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
  const activePointer = useRef<number | null>(null);
  const currentStrokes = useRef<SignatureStroke[]>([]);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);

  function change(next: SignatureStroke[]) {
    currentStrokes.current = next;
    setStrokes(next);
    onChange(next.filter((stroke) => stroke.length > 1));
  }

  function point(event: React.PointerEvent<SVGSVGElement>): [number, number] {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    ];
  }

  function finish(pointerId: number, element: SVGSVGElement) {
    if (activePointer.current !== pointerId) return;
    activePointer.current = null;
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    change(currentStrokes.current.filter((stroke) => stroke.length > 1));
  }

  function clear() {
    const pointerId = activePointer.current;
    activePointer.current = null;
    if (pointerId !== null && pad.current?.hasPointerCapture(pointerId))
      pad.current.releasePointerCapture(pointerId);
    change([]);
  }

  return (
    <div className={styles.signaturePad}>
      <svg
        ref={pad}
        viewBox="0 0 600 160"
        preserveAspectRatio="none"
        role="img"
        aria-label="Draw your signature"
        className={styles.canvas}
        onPointerDown={(event) => {
          if (disabled || activePointer.current !== null) return;
          event.preventDefault();
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          change([...currentStrokes.current, [point(event)]]);
        }}
        onPointerMove={(event) => {
          if (disabled || activePointer.current !== event.pointerId) return;
          event.preventDefault();
          const existing = currentStrokes.current;
          const last = existing.at(-1);
          if (!last || last.length >= 1000 || existing.length > 40) return;
          const next = point(event);
          const previous = last.at(-1)!;
          if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) < 0.0015)
            return;
          change([...existing.slice(0, -1), [...last, next]]);
        }}
        onPointerUp={(event) => finish(event.pointerId, event.currentTarget)}
        onPointerCancel={(event) => finish(event.pointerId, event.currentTarget)}
        onLostPointerCapture={(event) =>
          finish(event.pointerId, event.currentTarget)
        }
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
        className={styles.clear}
        disabled={disabled}
        onClick={clear}
      >
        Clear signature
      </button>
    </div>
  );
}
