"use client";

import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/boardConstants";

const MARK_INTERVAL = 100;
const RULER_SIZE = 24;

interface RulerProps {
  zoom: number;
  panOffset?: { x: number; y: number };
}

export function Ruler({ zoom, panOffset = { x: 0, y: 0 } }: RulerProps) {
  const totalMarks = Math.ceil(Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) / MARK_INTERVAL) + 1;

  return (
    <>
      {/* Top horizontal ruler */}
      <div
        className="absolute top-0 left-6 right-0 z-[2] overflow-hidden"
        style={{
          height: RULER_SIZE,
          background: "var(--surface-raised)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            transformOrigin: "top left",
            transform: `translateX(${panOffset.x}px) scaleX(${zoom})`,
          }}
        >
          {Array.from({ length: totalMarks }, (_, i) => (
            <div
              key={i}
              style={{
                width: MARK_INTERVAL,
                flexShrink: 0,
                position: "relative",
                height: RULER_SIZE,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  width: 1,
                  height: i % 5 === 0 ? 10 : 5,
                  background: "var(--border)",
                }}
              />
              {i % 5 === 0 && i > 0 && (
                <span
                  style={{
                    position: "absolute",
                    left: 3,
                    top: 4,
                    fontSize: 9,
                    color: "var(--text-muted)",
                    userSelect: "none",
                    transform: `scaleX(${1 / zoom})`,
                    transformOrigin: "left center",
                  }}
                >
                  {i * MARK_INTERVAL}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Left vertical ruler */}
      <div
        className="absolute top-6 left-0 bottom-0 z-[2] overflow-hidden"
        style={{
          width: RULER_SIZE,
          background: "var(--surface-raised)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            transformOrigin: "top left",
            transform: `translateY(${panOffset.y}px) scaleY(${zoom})`,
          }}
        >
          {Array.from({ length: totalMarks }, (_, i) => (
            <div
              key={i}
              style={{
                height: MARK_INTERVAL,
                flexShrink: 0,
                position: "relative",
                width: RULER_SIZE,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  height: 1,
                  width: i % 5 === 0 ? 10 : 5,
                  background: "var(--border)",
                }}
              />
              {i % 5 === 0 && i > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: 2,
                    fontSize: 9,
                    color: "var(--text-muted)",
                    userSelect: "none",
                    writingMode: "vertical-rl",
                    transform: `scaleY(${1 / zoom}) rotate(180deg)`,
                    transformOrigin: "center top",
                  }}
                >
                  {i * MARK_INTERVAL}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Corner square */}
      <div
        className="absolute top-0 left-0 z-[3]"
        style={{
          width: RULER_SIZE,
          height: RULER_SIZE,
          background: "var(--surface-raised)",
          borderRight: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      />
    </>
  );
}
