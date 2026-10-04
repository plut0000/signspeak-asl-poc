"use client";

import {
  readShowTrackingPref,
  writeShowTrackingPref,
} from "@/lib/landmark-overlay";
import { useCallback, useEffect, useState } from "react";

export function useShowTracking() {
  const [showTracking, setShowTracking] = useState(true);

  useEffect(() => {
    // Browser preference is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is a mount-time read
    setShowTracking(readShowTrackingPref(window.localStorage));
  }, []);

  const toggleShowTracking = useCallback(() => {
    setShowTracking((current) => {
      const next = !current;
      writeShowTrackingPref(window.localStorage, next);
      return next;
    });
  }, []);

  return { showTracking, toggleShowTracking };
}
