"use client";

import { useEffect, useRef, useState } from "react";

export type SearchOption = {
  id: string;
  label: string;
  secondary?: string;
  value: string;
  state?: string;
};

export type SearchOptionType = "qualification" | "study_field" | "occupation" | "course" | "location";

export function SearchableDatabaseSelect({
  label,
  type,
  value,
  placeholder,
  helper,
  onChange,
  onSelect,
}: {
  label: string;
  type: SearchOptionType;
  value: string;
  placeholder?: string;
  helper?: string;
  onChange: (value: string) => void;
  onSelect?: (option: SearchOption) => void;
}) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const endpoint = type === "qualification"
          ? `/api/local-v2/prior-qualifications?q=${encodeURIComponent(query)}`
          : `/api/local-v2/search-options?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`;

        const response = await fetch(endpoint, { signal: controller.signal });

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          const preview = (await response.text()).replace(/\s+/g, " ").slice(0, 120);
          console.error("Quick Match search returned a non-JSON response", {
            status: response.status,
            contentType,
            preview,
          });
          throw new Error(
            response.status === 404
              ? "Quick Match search API was not found. Restart the local development server after pulling the latest code."
              : `Quick Match search API returned ${response.status || "an invalid response"}. Check the npm dev terminal for the server error.`,
          );
        }

        const data = (await response.json()) as { options?: SearchOption[]; error?: string; detail?: string };
        if (!response.ok) throw new Error(data.detail || data.error || "Search failed.");
        setOptions(data.options ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
          setOptions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, type]);

  const choose = (option: SearchOption) => {
    setQuery(option.value);
    onChange(option.value);
    onSelect?.(option);
    setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ display: "grid", gap: 7, position: "relative" }}>
      <label style={{ fontWeight: 700 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            onChange(next);
            setOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          style={inputStyle}
        />
        <span style={searchIconStyle}>⌕</span>
      </div>

      {helper && <div style={helperStyle}>{helper}</div>}

      {open && (
        <div style={menuStyle}>
          <div style={menuHeaderStyle}>
            <span>{loading ? "Searching UniPath database…" : type === "qualification" ? "Prior qualifications from UniPath database" : "Suggestions from UniPath database"}</span>
            <span style={sourceBadgeStyle}>DB</span>
          </div>
          {error && <div style={errorStyle}>{error}</div>}
          {!loading && !error && options.length === 0 && (
            <div style={emptyStyle}>No matching database options. Try another word.</div>
          )}
          {options.map((option) => (
            <button key={option.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} style={optionStyle}>
              <span style={{ fontWeight: 750 }}>{option.label}</span>
              {option.secondary && <span style={secondaryStyle}>{option.secondary}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  border: "1px solid #cfd5df",
  borderRadius: 10,
  padding: "12px 38px 12px 12px",
  fontSize: 15,
  background: "#fff",
  outline: "none",
} as const;
const searchIconStyle = { position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: "#667085", pointerEvents: "none", fontSize: 18 } as const;
const helperStyle = { color: "#667085", fontSize: 12, lineHeight: 1.4 } as const;
const menuStyle = { position: "absolute", zIndex: 40, top: "100%", left: 0, right: 0, marginTop: 5, background: "#fff", border: "1px solid #d0d5dd", borderRadius: 12, boxShadow: "0 14px 32px rgba(16,24,40,0.14)", overflow: "hidden", maxHeight: 310, overflowY: "auto" } as const;
const menuHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #eaecf0", color: "#667085", fontSize: 11, fontWeight: 700 } as const;
const sourceBadgeStyle = { background: "#eaf3ff", color: "#0057b8", borderRadius: 999, padding: "2px 6px", fontSize: 10 } as const;
const optionStyle = { width: "100%", border: 0, borderBottom: "1px solid #f0f2f5", background: "#fff", textAlign: "left", padding: "11px 12px", cursor: "pointer", display: "grid", gap: 2, color: "#101828" } as const;
const secondaryStyle = { color: "#667085", fontSize: 12 } as const;
const emptyStyle = { padding: 14, color: "#667085", fontSize: 13 } as const;
const errorStyle = { padding: 14, color: "#b42318", background: "#fff6f5", fontSize: 13 } as const;
