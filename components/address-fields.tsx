"use client";

import { useEffect, useRef, useState } from "react";

type AddressValue = {
  fullAddress: string;
  city: string;
  state: string;
  countryCode: string;
  latitude: string;
  longitude: string;
  placeId: string;
};

type GooglePlace = {
  formatted_address?: string;
  place_id?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  geometry?: { location?: { lat(): number; lng(): number } };
};

type GoogleMapsWindow = Window & {
  google?: {
    maps: {
      places: { Autocomplete: new (input: HTMLInputElement, options: object) => { addListener(name: string, callback: () => void): void; getPlace(): GooglePlace } };
    };
  };
};

let mapsLoader: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string) {
  if ((window as GoogleMapsWindow).google?.maps) return Promise.resolve();
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise((resolve, reject) => {
    const existing = document.getElementById("central-ops-google-maps") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "central-ops-google-maps";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps could not load."));
    document.head.appendChild(script);
  });
  return mapsLoader;
}

function component(place: GooglePlace, type: string, short = false) {
  const match = place.address_components?.find((item) => item.types.includes(type));
  return match ? (short ? match.short_name : match.long_name) : "";
}

export function AddressFields({ apiKey = "", prefix = "" }: { apiKey?: string; prefix?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<AddressValue>({
    fullAddress: "", city: "", state: "", countryCode: "US", latitude: "", longitude: "", placeId: "",
  });
  const [error, setError] = useState("");
  const name = (field: string) => `${prefix}${field}`;

  useEffect(() => {
    if (!apiKey || !inputRef.current) return;
    let active = true;
    void loadGoogleMaps(apiKey).then(() => {
      if (!active || !inputRef.current) return;
      const google = (window as GoogleMapsWindow).google;
      if (!google) return;
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ["address_components", "formatted_address", "geometry", "place_id"],
        types: ["address"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const location = place.geometry?.location;
        const city = component(place, "locality") || component(place, "postal_town") || component(place, "administrative_area_level_2");
        const next = {
          fullAddress: place.formatted_address ?? inputRef.current?.value ?? "",
          city,
          state: component(place, "administrative_area_level_1", true) || component(place, "administrative_area_level_1"),
          countryCode: component(place, "country", true).toUpperCase(),
          latitude: location ? String(location.lat()) : "",
          longitude: location ? String(location.lng()) : "",
          placeId: place.place_id ?? "",
        };
        setValue(next);
        setError(next.fullAddress && next.city && next.state && next.countryCode ? "" : "Please complete any missing address fields.");
      });
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Address autocomplete could not load."));
    return () => { active = false; };
  }, [apiKey]);

  function manual(field: keyof AddressValue, nextValue: string) {
    setValue((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === "fullAddress" ? { latitude: "", longitude: "", placeId: "" } : {}),
    }));
  }

  return (
    <>
      <label className="full"><span>Full street address</span><input ref={inputRef} name={name("fullAddress")} required maxLength={240} value={value.fullAddress} onChange={(event) => manual("fullAddress", event.target.value)} placeholder="Start typing an address" autoComplete="street-address" /></label>
      <label><span>City</span><input name={name("city")} required maxLength={80} value={value.city} onChange={(event) => manual("city", event.target.value)} autoComplete="address-level2" /></label>
      <label><span>State, province, or region</span><input name={name("state")} required maxLength={100} value={value.state} onChange={(event) => manual("state", event.target.value)} autoComplete="address-level1" /></label>
      <label><span>Country code</span><input name={name("countryCode")} required minLength={2} maxLength={2} value={value.countryCode} onChange={(event) => manual("countryCode", event.target.value.toUpperCase())} placeholder="US" autoComplete="country" /></label>
      <input type="hidden" name={name("latitude")} value={value.latitude} />
      <input type="hidden" name={name("longitude")} value={value.longitude} />
      <input type="hidden" name={name("placeId")} value={value.placeId} />
      {!apiKey && <p className="field-note full">Google address autocomplete is awaiting the restricted Maps key. Manual international addresses work now.</p>}
      {error && <p className="field-error full" role="alert">{error}</p>}
    </>
  );
}
