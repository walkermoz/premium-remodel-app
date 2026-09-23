"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import {
  searchAddresses,
  wakeAddressSource,
  type AddressSuggestion,
} from "@/lib/address-search";

export default function AddressInput({
  defaultValue = "",
  label = "Job address",
  name = "address",
  onSuggestion,
}: {
  defaultValue?: string;
  label?: string;
  name?: string;
  onSuggestion?: (suggestion: AddressSuggestion) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const version = useRef(0);
  const cache = useRef(new Map<string, AddressSuggestion[]>());
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length < 4) return;
    const controller = new AbortController();
    const currentVersion = version.current;
    const timer = setTimeout(async () => {
      setStatus("loading");
      const key = query.trim().toLowerCase();
      try {
        let results = cache.current.get(key);
        if (!results) {
          results = await searchAddresses(query, controller.signal);
          if (controller.signal.aborted || version.current !== currentVersion)
            return;
          if (cache.current.size >= 40)
            cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, results);
        }
        if (controller.signal.aborted || version.current !== currentVersion)
          return;
        setMatches(results);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted && version.current === currentVersion)
          setStatus("error");
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(match: AddressSuggestion) {
    version.current++;
    setValue(match.address);
    setQuery("");
    setOpen(false);
    setActive(-1);
    setStatus("idle");
    onSuggestion?.(match);
    input.current?.focus();
  }
  const showList = open && status === "ready" && matches.length > 0;
  useEffect(() => {
    if (showList && active >= 0)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, id, showList]);
  return (
    <div
      className="address-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label htmlFor={`${id}-input`}>{label}</label>
      <input
        ref={input}
        id={`${id}-input`}
        name={name}
        value={value}
        placeholder="Start typing a street address…"
        maxLength={250}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? `${id}-list` : undefined}
        aria-activedescendant={
          showList && active >= 0 ? `${id}-option-${active}` : undefined
        }
        onFocus={() => {
          if (query.trim().length >= 4) setOpen(true);
        }}
        onChange={(event) => {
          version.current++;
          const next = event.target.value;
          setValue(next);
          setQuery(next);
          setMatches([]);
          setActive(-1);
          setStatus("idle");
          setOpen(next.trim().length >= 4);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActive(-1);
          } else if (
            (event.key === "ArrowDown" || event.key === "ArrowUp") &&
            matches.length
          ) {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              event.key === "ArrowDown"
                ? (index + 1) % matches.length
                : index <= 0
                  ? matches.length - 1
                  : index - 1,
            );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (showList && active >= 0) choose(matches[active]);
            else setOpen(false);
          }
        }}
      />
      {open && status !== "idle" && (
        <div className="address-dropdown">
          {showList ? (
            <>
              <ul
                id={`${id}-list`}
                role="listbox"
                aria-label="Address suggestions"
              >
                {matches.map((match, index) => (
                  <li
                    key={match.address}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={active === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(match)}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <div>
                      <strong>{match.street}</strong>
                      <span>{match.location}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="address-attribution">
                {matches[0]?.source === "wake" ? (
                  <>
                    Address data:{" "}
                    <a
                      href={wakeAddressSource.attribution}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wake County GIS
                    </a>
                    {" · "}
                    <a
                      href="https://creativecommons.org/licenses/by/4.0/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      CC BY 4.0
                    </a>
                  </>
                ) : (
                  <>
                    Address data ©{" "}
                    <a
                      href="https://www.openstreetmap.org/copyright"
                      target="_blank"
                      rel="noreferrer"
                    >
                      OpenStreetMap contributors
                    </a>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="address-search-message" role="status">
              {status === "loading"
                ? "Searching addresses…"
                : status === "error"
                  ? "Suggestions unavailable. You can enter the address manually."
                  : "No matches found. You can enter the address manually."}
            </p>
          )}
          <span className="sr-only" role="status">
            {showList
              ? `${matches.length} address suggestions available. Use the arrow keys to choose an address.`
              : ""}
          </span>
        </div>
      )}
    </div>
  );
}
