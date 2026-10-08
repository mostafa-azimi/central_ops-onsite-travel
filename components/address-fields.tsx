"use client";

import { useEffect, useId, useState } from "react";
import type { AddressSuggestion } from "@/lib/geocoding";

type AddressValue = {
  fullAddress: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  latitude: string;
  longitude: string;
  placeId: string;
};

export function AddressFields({ prefix = "" }: { prefix?: string }) {
  const listId = useId();
  const [value, setValue] = useState<AddressValue>({
    fullAddress: "", city: "", state: "", postalCode: "", countryCode: "US", latitude: "", longitude: "", placeId: "",
  });
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [manualAccepted, setManualAccepted] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [postalSearching, setPostalSearching] = useState(false);
  const [postalMessage, setPostalMessage] = useState("");
  const [lookedUpPostalKey, setLookedUpPostalKey] = useState("");
  const name = (field: string) => `${prefix}${field}`;

  useEffect(() => {
    const query = value.fullAddress.trim();
    const countryCode = value.countryCode.trim().toUpperCase();
    if (query.length < 4 || !/^[A-Z]{2}$/.test(countryCode) || value.placeId || manualAccepted) {
      setSuggestions([]);
      setSearching(false);
      setSearchedQuery("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/api/geocode?q=${encodeURIComponent(query)}&countryCode=${encodeURIComponent(countryCode)}`, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as { suggestions?: AddressSuggestion[] };
          if (!response.ok) throw new Error("Address suggestions are temporarily unavailable.");
          setSuggestions(body.suggestions ?? []);
          setSearchedQuery(query);
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
  }, [value.countryCode, value.fullAddress, value.placeId, manualAccepted]);

  useEffect(() => {
    const countryCode = value.countryCode.trim().toUpperCase();
    const postalCode = value.postalCode.trim().toUpperCase();
    const key = `${countryCode}:${postalCode}`;
    if (!/^[A-Z]{2}$/.test(countryCode) || postalCode.length < 3 || key === lookedUpPostalKey) {
      setPostalSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPostalSearching(true);
      void fetch(`/api/postal?countryCode=${encodeURIComponent(countryCode)}&postalCode=${encodeURIComponent(postalCode)}`, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as { match?: { city: string; state: string; latitude: number | null; longitude: number | null } | null; message?: string };
          if (!response.ok) throw new Error(body.message || "Postal code lookup is temporarily unavailable.");
          setLookedUpPostalKey(key);
          if (!body.match) {
            setPostalMessage("Postal code not found. Enter the city and state manually.");
            return;
          }
          setValue((current) => ({
            ...current,
            city: body.match!.city,
            state: body.match!.state,
            ...(!current.placeId.startsWith("osm:") && body.match!.latitude != null && body.match!.longitude != null
              ? {
                  latitude: String(body.match!.latitude),
                  longitude: String(body.match!.longitude),
                  placeId: `postal:${countryCode}:${postalCode}`,
                }
              : {}),
          }));
          setPostalMessage(`Filled ${body.match.city}, ${body.match.state} from the postal code.`);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setPostalMessage(error instanceof Error ? error.message : "Postal code lookup is temporarily unavailable.");
        })
        .finally(() => setPostalSearching(false));
    }, 550);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [lookedUpPostalKey, value.countryCode, value.postalCode]);

  function manual(field: keyof AddressValue, nextValue: string) {
    setValue((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === "fullAddress" ? { latitude: "", longitude: "", placeId: "" } : {}),
      ...(field === "postalCode" && current.placeId.startsWith("postal:") ? { latitude: "", longitude: "", placeId: "" } : {}),
    }));
    if (field === "fullAddress" || field === "countryCode") {
      setManualAccepted(false);
      setSearchedQuery("");
    }
    if (field === "postalCode" || field === "countryCode") {
      setLookedUpPostalKey("");
      setPostalMessage("");
    }
  }

  function choose(suggestion: AddressSuggestion) {
    setValue({
      fullAddress: suggestion.fullAddress,
      city: suggestion.city,
      state: suggestion.state,
      postalCode: suggestion.postalCode,
      countryCode: suggestion.countryCode,
      latitude: String(suggestion.latitude),
      longitude: String(suggestion.longitude),
      placeId: suggestion.placeId,
    });
    setSuggestions([]);
    setMessage(suggestion.state ? "Address selected." : "Address selected. Add the state, province, or region if applicable.");
  }

  function useTypedAddress() {
    setManualAccepted(true);
    setSuggestions([]);
    setSearchedQuery("");
    setMessage("Using the address exactly as entered. Confirm the city, state, and country below.");
  }

  const query = value.fullAddress.trim();
  const showSuggestions = !value.placeId && !manualAccepted && (suggestions.length > 0 || (!searching && searchedQuery === query));

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
        {showSuggestions && (
          <ul className="address-suggestions" id={listId} role="listbox">
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId} role="option" aria-selected="false">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)}>{suggestion.label}</button>
              </li>
            ))}
            {suggestions.length === 0 && <li className="address-no-match">No exact match in the selected country.</li>}
            <li className="address-manual" role="option" aria-selected="false">
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={useTypedAddress}>Use address exactly as entered</button>
            </li>
          </ul>
        )}
      </label>
      <label><span>ZIP or postal code</span><input name={name("postalCode")} required minLength={2} maxLength={16} value={value.postalCode} onChange={(event) => manual("postalCode", event.target.value.toUpperCase())} placeholder="36507" autoComplete="postal-code" /></label>
      <label><span>Country code</span><input name={name("countryCode")} required minLength={2} maxLength={2} value={value.countryCode} onChange={(event) => manual("countryCode", event.target.value.toUpperCase())} placeholder="US" autoComplete="country" /></label>
      <label><span>City</span><input name={name("city")} required maxLength={80} value={value.city} onChange={(event) => manual("city", event.target.value)} autoComplete="address-level2" /></label>
      <label><span>State, province, or region</span><input name={name("state")} required maxLength={100} value={value.state} onChange={(event) => manual("state", event.target.value)} autoComplete="address-level1" /></label>
      <input type="hidden" name={name("latitude")} value={value.latitude} />
      <input type="hidden" name={name("longitude")} value={value.longitude} />
      <input type="hidden" name={name("placeId")} value={value.placeId} />
      {(postalSearching || postalMessage) && <p className="field-note full" role="status">{postalSearching ? "Looking up the postal code…" : postalMessage}</p>}
      <p className="field-note full">{searching ? `Searching ${value.countryCode || "the selected country"}…` : message || "Suggestions use OpenStreetMap and stay within the selected country. You can always use the address exactly as entered."}</p>
    </>
  );
}
