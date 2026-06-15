"use client";

export type CoreState = "idle" | "listening" | "thinking" | "speaking";

export function OrionCore({
  state,
  size = 240,
  onClick,
  title,
}: {
  state: CoreState;
  size?: number;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <div
      className="orion-core"
      data-state={state}
      style={{ width: size, height: size }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={title}
      aria-label="ORION"
    >
      <div className="halo" />
      <div className="ring" style={{ inset: "0%" }} />
      <div className="ring" style={{ inset: "10%", opacity: 0.6 }} />
      <div className="ring" style={{ inset: "18%", opacity: 0.4 }} />
      <div className="nucleus" />
    </div>
  );
}
