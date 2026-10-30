"use client";
// "Add a line item" on a favourite: pick from the price book (submits straight away).
import { useRef, useState } from "react";
import { saveFavouriteLineAction } from "@/app/dashboard/quote-actions";
import { ItemSearch } from "@/components/office/ItemSearch";

export function FavLineAdder({ favouriteId, back }: { favouriteId: string; back: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [item, setItem] = useState("");
  return (
    <form ref={form} action={saveFavouriteLineAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="favouriteId" value={favouriteId} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="price_book_item_id" value={item} />
      <input type="hidden" name="quantity" value="1" />
      <ItemSearch
        id="fav-item-search"
        onPick={(it) => {
          setItem(it.id);
          setTimeout(() => form.current?.requestSubmit(), 0);
        }}
      />
    </form>
  );
}
