"use client";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { Card, Direction, Sentence } from "@/lib/types";
import { EnFace, ZhFace } from "./CardFaces";

export type SwipeDir = "left" | "right";
export interface SwipeCardHandle {
  swipe: (dir: SwipeDir) => void;
}

const THRESHOLD = 110;

export const SwipeCard = forwardRef<
  SwipeCardHandle,
  {
    card: Card;
    direction: Direction;
    sentence: Sentence | null;
    flipped: boolean;
    onFlip: () => void;
    onSwiped: (dir: SwipeDir) => void;
    badge?: string;
  }
>(function SwipeCard({ card, direction, sentence, flipped, onFlip, onSwiped, badge }, ref) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-14, 0, 14]);
  const leftOpacity = useTransform(x, [-THRESHOLD, -20, 0], [1, 0, 0]);
  const rightOpacity = useTransform(x, [0, 20, THRESHOLD], [0, 0, 1]);
  const dragged = useRef(false);
  const leaving = useRef(false);

  const fly = (dir: SwipeDir) => {
    if (leaving.current) return;
    leaving.current = true;
    const w = typeof window !== "undefined" ? window.innerWidth : 800;
    animate(x, dir === "right" ? w + 200 : -w - 200, { duration: 0.28, ease: "easeIn" }).then(() =>
      onSwiped(dir),
    );
  };

  useImperativeHandle(ref, () => ({ swipe: fly }));

  const front = direction === "zh2en" ? "zh" : "en";
  const face = (side: "zh" | "en", isAnswer: boolean) =>
    side === "zh" ? (
      <ZhFace card={card} sentence={sentence} isAnswer={isAnswer} />
    ) : (
      <EnFace card={card} sentence={sentence} isAnswer={isAnswer} />
    );

  return (
    <motion.div
      className="absolute inset-0 touch-pan-y select-none cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.9}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={(_, info) => {
        setTimeout(() => (dragged.current = false), 50);
        if (info.offset.x > THRESHOLD || info.velocity.x > 700) fly("right");
        else if (info.offset.x < -THRESHOLD || info.velocity.x < -700) fly("left");
      }}
      onClick={() => {
        if (!dragged.current && !leaving.current) onFlip();
      }}
    >
      <div className="flip-scene w-full h-full">
        <div className={`flip-inner relative w-full h-full ${flipped ? "flipped" : ""}`}>
          <div className="flip-face absolute inset-0 rounded-3xl border border-line bg-card shadow-xl shadow-black/5 overflow-hidden">
            {face(front, false)}
          </div>
          <div className="flip-face flip-back absolute inset-0 rounded-3xl border border-line bg-card shadow-xl shadow-black/5 overflow-hidden">
            {face(front === "zh" ? "en" : "zh", true)}
          </div>
        </div>
      </div>
      {badge && (
        <div className="absolute top-4 left-4 text-[11px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 bg-gold/15 text-gold">
          {badge}
        </div>
      )}
      <motion.div
        style={{ opacity: leftOpacity }}
        className="pointer-events-none absolute top-6 right-6 rotate-12 rounded-xl border-4 border-seal text-seal px-3 py-1 text-2xl font-black tracking-wide"
      >
        AGAIN
      </motion.div>
      <motion.div
        style={{ opacity: rightOpacity }}
        className="pointer-events-none absolute top-6 left-6 -rotate-12 rounded-xl border-4 border-jade text-jade px-3 py-1 text-2xl font-black tracking-wide"
      >
        {flipped ? "GOT IT" : "EASY"}
      </motion.div>
    </motion.div>
  );
});
