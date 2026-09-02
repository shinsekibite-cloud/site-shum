"use client";

import dynamic from "next/dynamic";

const TetrisGame = dynamic(() => import("@/components/games/TetrisGame"), { ssr: false });

export default function TetrisPage() {
  return <TetrisGame />;
}
