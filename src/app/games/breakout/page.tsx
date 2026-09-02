"use client";

import dynamic from "next/dynamic";

const BreakoutGame = dynamic(() => import("@/components/games/BreakoutGame"), { ssr: false });

export default function BreakoutPage() {
  return <BreakoutGame />;
}
