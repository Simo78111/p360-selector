import type { StaticImageData } from "next/image";
import barFitOut from "../../public/work/bar-fit-out.jpg";
import bravo from "../../public/work/bravo.jpg";
import hilton from "../../public/work/hilton.jpg";
import homeDeck from "../../public/work/home-deck.jpg";
import homePool from "../../public/work/home-pool.jpg";
import koruLounge from "../../public/work/koru-lounge-nadi.jpg";
import northernClub from "../../public/work/northern-club.jpg";
import panameSocial from "../../public/work/paname-social.jpg";
import restaurant from "../../public/work/restaurant.jpg";
import rooftopBar from "../../public/work/rooftop-bar.jpg";
import washroom from "../../public/work/washroom.jpg";

// Project photos from plumbing360.co.nz. Captions marked CHECK are a best
// guess from the photo; confirm them before launch.
export type WorkPhoto = { src: StaticImageData; caption: string; alt: string };

export const gallery: WorkPhoto[] = [
  { src: northernClub, caption: "Northern Club Bankside extension", alt: "Bar and lounge at the Northern Club Bankside extension" },
  { src: koruLounge, caption: "Air NZ Koru Lounge, Nadi", alt: "Air New Zealand Koru Lounge in Nadi" },
  { src: hilton, caption: "Hilton Hotel, level 8", alt: "Hilton Hotel on Princes Wharf, Auckland" },
  { src: bravo, caption: "Bravo", alt: "Bravo restaurant terrace beside the marina" }, // CHECK
  { src: washroom, caption: "Commercial washroom", alt: "Modern commercial washroom with stone vanity" }, // CHECK
  { src: panameSocial, caption: "Paname Social", alt: "Paname Social bar frontage at dusk" },
  { src: rooftopBar, caption: "Rooftop bar", alt: "Rooftop bar with sea views" }, // CHECK
];

export const homePhotos = { pool: homePool, deck: homeDeck, barFitOut, restaurant };
