import { Suspense } from "react";
import { CardDetail } from "./CardDetail";

export default function CardDetailPage() {
  return (
    <Suspense fallback={<div className="text-ink-soft">Loading…</div>}>
      <CardDetail />
    </Suspense>
  );
}
