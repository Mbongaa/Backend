import { useEffect, useRef, useState, type CSSProperties } from "react";
import lottie, { type AnimationItem } from "lottie-web/build/player/lottie_light";

type JuiceLottieProps = {
  className?: string;
  style?: CSSProperties;
};

export function JuiceLottie({ className, style }: JuiceLottieProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const animation: AnimationItem = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: false,
      autoplay: true,
      path: "/uploads/Juice.json",
      initialSegment: [0, 74],
      rendererSettings: {
        preserveAspectRatio: "xMidYMid meet",
        progressiveLoad: false,
      },
    });

    const markLoaded = () => setLoaded(true);
    animation.addEventListener("DOMLoaded", markLoaded);

    let replayTimer: ReturnType<typeof setTimeout> | null = null;
    const handleComplete = () => {
      replayTimer = setTimeout(() => {
        animation.goToAndPlay(0, true);
      }, 2000);
    };
    animation.addEventListener("complete", handleComplete);

    return () => {
      if (replayTimer) clearTimeout(replayTimer);
      animation.removeEventListener("DOMLoaded", markLoaded);
      animation.removeEventListener("complete", handleComplete);
      animation.destroy();
    };
  }, []);

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <div
        ref={containerRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          opacity: loaded ? 1 : 0,
          transition: "opacity 160ms ease",
        }}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 160 160"
        style={{
          position: "absolute",
          inset: "16%",
          fill: "none",
          opacity: loaded ? 0 : 1,
          stroke: "currentColor",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 7,
          transition: "opacity 160ms ease",
        }}
      >
        <path d="M92 25h36" />
        <path d="M110 25 91 60" />
        <path d="M47 58h76l-10 74a14 14 0 0 1-14 12H71a14 14 0 0 1-14-12L47 58Z" />
        <path d="M58 78h56" />
        <path d="M68 92c9 7 25 7 36 0" />
        <path d="M75 112h28" />
      </svg>
    </div>
  );
}
