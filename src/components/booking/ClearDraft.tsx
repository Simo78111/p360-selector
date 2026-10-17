"use client";

import { useEffect } from "react";

/** Forgets the saved booking form once a booking has gone through. */
export function ClearDraft() {
  useEffect(() => {
    try {
      sessionStorage.removeItem("p360-booking-draft");
    } catch {}
  }, []);
  return null;
}
