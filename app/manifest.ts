import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "গন্তব্য",
    short_name: "গন্তব্য",
    description:
      "Personal academic operating system for study planning and progress.",
    start_url: "/",
    display: "standalone",
    background_color: "#F3FCF3",
    theme_color: "#18E299",
    lang: "bn-BD",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/pwa/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
