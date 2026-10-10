import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ShipHero Central Ops Travel",
    short_name: "Central Ops Travel",
    description: "Plan, approve, and join ShipHero Central Ops customer visits.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f0f6fe",
    theme_color: "#263444",
    orientation: "any",
    categories: ["business", "productivity", "travel"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Submit a request", short_name: "Request", url: "/?view=submit", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Map view", short_name: "Map", url: "/map", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Calendar view", short_name: "Calendar", url: "/calendar", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
