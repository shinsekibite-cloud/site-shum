/** Pass-through — no enter animation (opacity/transform caused blue/blank flash). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
