"use client";

import { useCallback, useEffect, useState } from "react";
import { GitCompareArrows } from "lucide-react";

const STORAGE_KEY = "unipath_compare_courses";
const EVENT_NAME = "unipath-compare-change";

function readIds() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
}

export default function CompareCourseToggle({ courseId }: { courseId: string }) {
  const [ids, setIds] = useState<string[]>([]);

  const sync = useCallback(() => setIds(readIds()), []);

  useEffect(() => {
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);

  const selected = ids.includes(courseId);

  function toggle() {
    const current = readIds();
    let next: string[];

    if (current.includes(courseId)) {
      next = current.filter((id) => id !== courseId);
    } else if (current.length < 4) {
      next = [...current, courseId];
    } else {
      next = [...current.slice(1), courseId];
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT_NAME));
  }

  return (
    <div className="explorerCompareControl">
      <button type="button" onClick={toggle} aria-pressed={selected} title={selected ? "Remove from comparison" : "Add to comparison"}>
        <GitCompareArrows size={15}/>{selected ? "Added" : "Compare"}
      </button>
      {ids.length >= 2 && <a href={`/compare?ids=${ids.join(",")}`}>Compare {ids.length}</a>}
    </div>
  );
}
