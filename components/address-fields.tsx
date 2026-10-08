"use client";

import { useEffect, useState } from "react";
import { normalizeCountryCode, normalizePostalCode, postalLookupCode } from "@/lib/geocoding";

type PostalMatch = {
  city: string;
  state: string;
};

type AddressDefaults = {
  fullAddress?: string;
  postalCode?: string;
  countryCode?: string;
  city?: string;
  state?: string;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string;
};

export function AddressFields({ prefix = "", initial = {} }: { prefix?: string; initial?: AddressDefaults }) {
  const name = (field: string) => `${prefix}${field}`;
  const [postalCode, setPostalCode] = useState(initial.postalCode ?? "");
  const [countryCode, setCountryCode] = useState(initial.countryCode ?? "US");
  const [city, setCity] = useState(initial.city ?? "");
  const [region, setRegion] = useState(initial.state ?? "");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "success" | "no-match" | "error">("idle");

  useEffect(() => {
    const normalizedCountry = normalizeCountryCode(countryCode);
    const normalizedPostal = normalizePostalCode(postalCode);
    const lookupLength = normalizedCountry && normalizedPostal
      ? postalLookupCode(normalizedCountry, normalizedPostal).length
      : 0;
    const minimumLength = normalizedCountry === "US" ? 5 : 3;
    if (!normalizedCountry || !normalizedPostal || lookupLength < minimumLength) {
      setLookupStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLookupStatus("loading");
      try {
        const query = new URLSearchParams({ countryCode: normalizedCountry, postalCode: normalizedPostal });
        const response = await fetch(`/api/postal?${query}`, { signal: controller.signal });
        const body = (await response.json()) as { match?: PostalMatch | null };
        if (!response.ok) throw new Error("Postal lookup failed");
        if (!body.match) {
          setLookupStatus("no-match");
          return;
        }
        setCity(body.match.city);
        setRegion(body.match.state);
        setLookupStatus("success");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLookupStatus("error");
      }
    }, 400);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [countryCode, postalCode]);

  return (
    <>
      <label className="full">
        <span>Full street address</span>
        <input
          name={name("fullAddress")}
          required
          maxLength={240}
          placeholder="2109 N US Hwy 31"
          autoComplete="off"
          defaultValue={initial.fullAddress ?? ""}
        />
      </label>
      <label>
        <span>ZIP or postal code</span>
        <input
          name={name("postalCode")}
          required
          minLength={2}
          maxLength={16}
          placeholder="36507"
          autoComplete="off"
          value={postalCode}
          onChange={(event) => setPostalCode(event.target.value)}
        />
      </label>
      <label>
        <span>Country code</span>
        <input
          name={name("countryCode")}
          required
          minLength={2}
          maxLength={2}
          placeholder="US"
          autoComplete="off"
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
        />
      </label>
      <label>
        <span>City</span>
        <input name={name("city")} required maxLength={80} placeholder="Bay Minette" autoComplete="off" value={city} onChange={(event) => setCity(event.target.value)} />
      </label>
      <label>
        <span>State, province, or region</span>
        <input name={name("state")} required maxLength={100} placeholder="AL" autoComplete="off" value={region} onChange={(event) => setRegion(event.target.value)} />
      </label>
      <input type="hidden" name={name("latitude")} defaultValue={initial.latitude ?? ""} />
      <input type="hidden" name={name("longitude")} defaultValue={initial.longitude ?? ""} />
      <input type="hidden" name={name("placeId")} defaultValue={initial.placeId ?? ""} />
      <p className="field-note full" role="status" aria-live="polite">
        {lookupStatus === "loading" && "Looking up city and state…"}
        {lookupStatus === "success" && "City and state filled from the ZIP or postal code. You can edit either field."}
        {lookupStatus === "no-match" && "No city or state match was found. Enter both fields manually."}
        {lookupStatus === "error" && "City and state lookup is unavailable. Enter both fields manually."}
        {lookupStatus === "idle" && "Enter the street address manually. ZIP or postal code fills city and state when available."}
      </p>
    </>
  );
}
