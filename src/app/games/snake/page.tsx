"use client";

import dynamic from "next/dynamic";

const SnakeGame = dynamic(() => import("@/components/games/SnakeGame"), { ssr: false });

export default function SnakePage() {
  return <SnakeGame />;
}
