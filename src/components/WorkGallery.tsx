import Image from "next/image";
import { gallery } from "@/lib/work";

// Bento layout: one large feature photo, then a mix of square and wide tiles.
// Desktop is 4 columns x 3 rows; phones are 2 columns.
const layout = [
  "col-span-2 row-span-2",
  "",
  "",
  "col-span-2",
  "",
  "",
  "col-span-2",
];

export function WorkGallery() {
  return (
    <ul className="grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[200px] lg:grid-cols-4">
      {gallery.map((photo, i) => (
        <li key={photo.caption} className={`group relative overflow-hidden rounded-2xl bg-mist ${layout[i] ?? ""}`}>
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            placeholder="blur"
            sizes={i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-3">
            <p className={`font-semibold text-white ${i === 0 ? "text-base sm:text-lg" : "text-sm"}`}>{photo.caption}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
