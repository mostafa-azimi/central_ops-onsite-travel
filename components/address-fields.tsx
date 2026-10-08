"use client";

export function AddressFields({ prefix = "" }: { prefix?: string }) {
  const name = (field: string) => `${prefix}${field}`;

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
        />
      </label>
      <label>
        <span>Country code</span>
        <input
          name={name("countryCode")}
          required
          minLength={2}
          maxLength={2}
          defaultValue="US"
          placeholder="US"
          autoComplete="off"
        />
      </label>
      <label>
        <span>City</span>
        <input name={name("city")} required maxLength={80} placeholder="Bay Minette" autoComplete="off" />
      </label>
      <label>
        <span>State, province, or region</span>
        <input name={name("state")} required maxLength={100} placeholder="AL" autoComplete="off" />
      </label>
      <input type="hidden" name={name("latitude")} defaultValue="" />
      <input type="hidden" name={name("longitude")} defaultValue="" />
      <input type="hidden" name={name("placeId")} defaultValue="" />
      <p className="field-note full">Enter the address exactly as it should appear on the visit.</p>
    </>
  );
}
