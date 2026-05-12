import { useEffect, useRef, useState, type CSSProperties } from "react";
import lottie, { type AnimationItem } from "lottie-web/build/player/lottie_light";

type SuccessLottieProps = {
  className?: string;
  style?: CSSProperties;
  size?: number;
};

export function SuccessLottie({ className, style, size = 64 }: SuccessLottieProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const animation: AnimationItem = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: false,
      autoplay: true,
      path: "/uploads/Success.json",
      rendererSettings: {
        preserveAspectRatio: "xMidYMid meet",
        progressiveLoad: false,
      },
    });

    const handleFailed = () => setFailed(true);
    animation.addEventListener("data_failed", handleFailed);

    return () => {
      animation.removeEventListener("data_failed", handleFailed);
      animation.destroy();
    };
  }, []);

  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height: size, ...style }}
    >
      <div
        ref={containerRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0 }}
      />
      {failed && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "var(--ink)",
            color: "#FBFBF8",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width={Math.round(size * 0.45)}
            height={Math.round(size * 0.45)}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12L10 17L20 7" />
          </svg>
        </div>
      )}
    </div>
  );
}
