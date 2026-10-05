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
  formattedAddress?: string;
  id?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types: string[] }>;
  location?: { lat(): number; lng(): number };
  fetchFields(options: { fields: string[] }): Promise<void>;
};

type PlacePrediction = { toPlace(): GooglePlace };
type PlaceSelectEvent = Event & { placePrediction?: PlacePrediction };
type PlaceAutocompleteElement = HTMLElement & { placeholder: string };

type GoogleMapsWindow = Window & {
  google?: {
    maps: {
      importLibrary(name: "places"): Promise<{ PlaceAutocompleteElement: new () => PlaceAutocompleteElement }>;
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
  const match = place.addressComponents?.find((item) => item.types.includes(type));
  return match ? (short ? match.shortText : match.longText) ?? "" : "";
}

export function AddressFields({ apiKey = "", prefix = "" }: { apiKey?: string; prefix?: string }) {
  const autocompleteHost = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<AddressValue>({
    fullAddress: "", city: "", state: "", countryCode: "US", latitude: "", longitude: "", placeId: "",
  });
  const [error, setError] = useState("");
  const name = (field: string) => `${prefix}${field}`;

  useEffect(() => {
    if (!apiKey || !autocompleteHost.current) return;
    let active = true;
    void loadGoogleMaps(apiKey).then(async () => {
      if (!active || !autocompleteHost.current) return;
      const google = (window as GoogleMapsWindow).google;
      if (!google) return;
      const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
      const autocomplete = new PlaceAutocompleteElement();
      autocomplete.placeholder = "Start typing a customer address";
      autocomplete.className = "google-address-autocomplete";
      autocomplete.addEventListener("gmp-select", (rawEvent: Event) => {
        const prediction = (rawEvent as PlaceSelectEvent).placePrediction;
        if (!prediction) return;
        const place = prediction.toPlace();
        void place.fetchFields({ fields: ["formattedAddress", "addressComponents", "location", "id"] }).then(() => {
        const location = place.location;
        const city = component(place, "locality") || component(place, "postal_town") || component(place, "administrative_area_level_2");
        const next = {
          fullAddress: place.formattedAddress ?? "",
          city,
          state: component(place, "administrative_area_level_1", true) || component(place, "administrative_area_level_1"),
          countryCode: component(place, "country", true).toUpperCase(),
          latitude: location ? String(location.lat()) : "",
          longitude: location ? String(location.lng()) : "",
          placeId: place.id ?? "",
        };
        setValue(next);
        setError(next.fullAddress && next.city && next.state && next.countryCode ? "" : "Please complete any missing address fields.");
        }).catch(() => setError("That address could not be completed."));
      });
      autocompleteHost.current.replaceChildren(autocomplete);
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
      {apiKey && <label className="full"><span>Find address with Google</span><div ref={autocompleteHost} className="autocomplete-host" /></label>}
      <label className="full"><span>Full street address</span><input name={name("fullAddress")} required maxLength={240} value={value.fullAddress} onChange={(event) => manual("fullAddress", event.target.value)} placeholder="Start typing an address" autoComplete="street-address" /></label>
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
