import { PackageCard } from "@/components/ui";
import { formatRs, type Paisa } from "@/lib/money";

export type PickerPackage = {
  id: string;
  name: string;
  price: Paisa;
  peakSurcharge: Paisa;
  inclusions: string[];
  deliveryDays: number;
};

/**
 * Native radio group styled as the compact package cards. Works without
 * JavaScript; the checked card picks up the selected look via :has().
 * Shown in the provider's own order, never cheapest-first.
 */
export function PackagePicker({ packages, selected, name = "package" }: { packages: PickerPackage[]; selected: string; name?: string }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="sr-only">Choose a package</legend>
      {packages.map((k) => (
        <label key={k.id} className="group relative block cursor-pointer rounded-card has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
          <input type="radio" name={name} value={k.id} defaultChecked={k.id === selected} className="peer sr-only" />
          <span className="block rounded-card [&>*]:transition-colors peer-checked:[&>*]:border-ink peer-checked:[&>*]:bg-tint">
            <PackageCard
              as="span"
              size="compact"
              data={{
                name: k.name,
                price: formatRs(k.price),
                description: (k.inclusions.some((i) => /\bdays?$/.test(i)) ? k.inclusions : [...k.inclusions, `${k.deliveryDays} days`]).join(" · "),
                peakNote: k.peakSurcharge > 0 ? `Plus ${formatRs(k.peakSurcharge)} on a wedding date` : "No surcharge",
              }}
            />
          </span>
        </label>
      ))}
    </fieldset>
  );
}
