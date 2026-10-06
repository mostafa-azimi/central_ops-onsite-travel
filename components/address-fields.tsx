"use client";

import { useEffect, useId, useState } from "react";
import type { AddressSuggestion } from "@/lib/geocoding";

type AddressValue = {
  fullAddress: string;
  city: string;
  state: string;
  countryCode: string;
  latitude: string;
  longitude: string;
  placeId: string;
};

export function AddressFields({ prefix = "" }: { prefix?: string }) {
  const listId = useId();
  const [value, setValue] = useState<AddressValue>({
    fullAddress: "", city: "", state: "", countryCode: "US", latitude: "", longitude: "", placeId: "",
  });
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const name = (field: string) => `${prefix}${field}`;

  useEffect(() => {
    const query = value.fullAddress.trim();
    if (query.length < 4 || value.placeId) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as { suggestions?: AddressSuggestion[] };
          if (!response.ok) throw new Error("Address suggestions are temporarily unavailable.");
          setSuggestions(body.suggestions ?? []);
          setMessage("");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions([]);
          setMessage("Suggestions are unavailable. You can still enter the address manually.");
        })
        .finally(() => setSearching(false));
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value.fullAddress, value.placeId]);

  function manual(field: keyof AddressValue, nextValue: string) {
    setValue((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === "fullAddress" ? { latitude: "", longitude: "", placeId: "" } : {}),
    }));
  }

  function choose(suggestion: AddressSuggestion) {
    setValue({
      fullAddress: suggestion.fullAddress,
      city: suggestion.city,
      state: suggestion.state,
      countryCode: suggestion.countryCode,
      latitude: String(suggestion.latitude),
      longitude: String(suggestion.longitude),
      placeId: suggestion.placeId,
    });
    setSuggestions([]);
    setMessage(suggestion.state ? "Address selected." : "Address selected. Add the state, province, or region if applicable.");
  }

  return (
    <>
      <label className="full address-search"><span>Full street address</span>
        <input
          name={name("fullAddress")}
          required
          maxLength={240}
          value={value.fullAddress}
          onChange={(event) => manual("fullAddress", event.target.value)}
          placeholder="Start typing an address"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
        />
        {suggestions.length > 0 && (
          <ul className="address-suggestions" id={listId} role="listbox">
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId} role="option" aria-selected="false">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)}>{suggestion.label}</button>
              </li>
            ))}
          </ul>
        )}
      </label>
      <label><span>City</span><input name={name("city")} required maxLength={80} value={value.city} onChange={(event) => manual("city", event.target.value)} autoComplete="address-level2" /></label>
      <label><span>State, province, or region</span><input name={name("state")} required maxLength={100} value={value.state} onChange={(event) => manual("state", event.target.value)} autoComplete="address-level1" /></label>
      <label><span>Country code</span><input name={name("countryCode")} required minLength={2} maxLength={2} value={value.countryCode} onChange={(event) => manual("countryCode", event.target.value.toUpperCase())} placeholder="US" autoComplete="country" /></label>
      <input type="hidden" name={name("latitude")} value={value.latitude} />
      <input type="hidden" name={name("longitude")} value={value.longitude} />
      <input type="hidden" name={name("placeId")} value={value.placeId} />
      <p className="field-note full">{searching ? "Searching addresses…" : message || "Address search uses OpenStreetMap data. Manual international entry is always available."}</p>
    </>
  );
}
