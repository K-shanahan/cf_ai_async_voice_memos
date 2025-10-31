import { useEffect, useRef } from "react";

interface VolumeMeterProps {
  volume: number; // 0-100
  barCount?: number;
  isActive?: boolean;
}

/**
 * Visual volume meter component that displays animated bars
 * representing the current audio level during recording
 */
export function VolumeMeter({
  volume,
  barCount = 8,
  isActive = true,
}: VolumeMeterProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate which bars should be filled based on volume
  const filledBars = Math.round((volume / 100) * barCount);

  // Determine color based on volume level
  const getBarColor = (index: number): string => {
    const isFilled = index < filledBars;
    if (!isFilled) return "bg-slate-700";

    // Green for quiet, yellow for moderate, red for loud
    const percentage = (index / barCount) * 100;
    if (percentage < 50) return "bg-green-500";
    if (percentage < 75) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center gap-1"
      aria-label={`Volume meter: ${volume}%`}
    >
      {Array.from({ length: barCount }).map((_, index) => (
        <div
          key={index}
          className={`transition-all duration-75 ease-out rounded-sm ${getBarColor(index)}`}
          style={{
            width: "4px",
            height: `${12 + (index + 1) * 4}px`,
            opacity: isActive ? 1 : 0.5,
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
