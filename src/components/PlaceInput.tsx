import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces, type Place } from "../core/services";

interface Props {
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  locate?: boolean;
  /** Texts to look up right away, best first (a place shared from another app). */
  lookup?: string[];
}

export default function PlaceInput({ label, placeholder, value, onChange, locate, lookup }: Props) {
  const id = useId();
  const [text, setText] = useState("");
  const [items, setItems] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState("");
  const typing = useRef(false);
  const skip = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { typing.current = false; setText(value?.label ?? ""); setItems([]); setNote(""); }, [value]);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (!typing.current || text.trim().length < 3) { setItems([]); return; }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(text, ctl.signal)
        .then((r) => { setItems(r); setActive(0); setNote(r.length ? "" : "No results in Spain"); })
        .catch(() => { if (!ctl.signal.aborted) setNote("Place search is not responding. Try an example."); });
    }, 350);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [text]);

  useEffect(() => {
    if (!lookup?.length) return;
    const ctl = new AbortController();
    (async () => {
      try {
        let found: Place[] = [];
        for (const q of lookup) {
          found = await searchPlaces(q, ctl.signal);
          if (found.length) break;
        }
        if (ctl.signal.aborted) return;
        // The shared text is shown, but the person confirms which place it is.
        skip.current = typing.current = true;
        setText(lookup[lookup.length - 1]);
        setItems(found);
        setActive(0);
        setNote(found.length ? "Choose the shared place" : "The shared place was not found. Type its city or address.");
        input.current?.focus();
      } catch { if (!ctl.signal.aborted) setNote("Place search is not responding. Type the destination later."); }
    })();
    return () => ctl.abort();
  }, [lookup]);

  function useLocation() {
    if (!navigator.geolocation) { setNote("Your browser does not offer location"); return; }
    setNote("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setNote(""); onChange({ label: "My location", point: [p.coords.longitude, p.coords.latitude], here: true }); },
      () => setNote("Could not get your location"),
      { timeout: 10000 },
    );
  }

  return (
    <div className="place">
      <label htmlFor={id}>{label}</label>
      <div className="place-row">
        <input
          ref={input} id={id} value={text} placeholder={placeholder} autoComplete="off" role="combobox"
          aria-expanded={items.length > 0} aria-controls={`${id}-list`}
          aria-activedescendant={items.length ? `${id}-${active}` : undefined}
          onChange={(e) => { typing.current = true; setText(e.target.value); setNote(""); }}
          onKeyDown={(e) => {
            if (!items.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % items.length); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((active + items.length - 1) % items.length); }
            if (e.key === "Enter") { e.preventDefault(); onChange(items[active]); }
            if (e.key === "Escape") setItems([]);
          }}
          onBlur={() => setTimeout(() => {
            setItems([]);
            // What is shown is always what will be used.
            if (typing.current) { typing.current = false; setText(value?.label ?? ""); }
          }, 200)}
        />
        {locate && <button type="button" className="icon-btn" onClick={useLocation} aria-label="Use my location">◎</button>}
      </div>
      {items.length > 0 && (
        <ul className="suggest" id={`${id}-list`} role="listbox">
          {items.map((it, i) => (
            <li key={i} id={`${id}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); onChange(it); }}>{it.label}</li>
          ))}
        </ul>
      )}
      {note && <p className="note" role="status">{note}</p>}
    </div>
  );
}
