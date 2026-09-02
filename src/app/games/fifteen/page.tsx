"use client";

import dynamic from "next/dynamic";

const FifteenPuzzleGame = dynamic(() => import("@/components/games/FifteenPuzzleGame"), {
  ssr: false,
});

export default function FifteenPage() {
  return <FifteenPuzzleGame />;
}
