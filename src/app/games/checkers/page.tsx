"use client";

import dynamic from "next/dynamic";

const CheckersGame = dynamic(() => import("@/components/games/CheckersGame"), { ssr: false });

export default function CheckersPage() {
  return <CheckersGame />;
}
