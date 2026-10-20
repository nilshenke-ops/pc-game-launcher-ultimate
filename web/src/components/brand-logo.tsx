import type { Brand } from "../lib/brands";
import { brandFg } from "../lib/brands";

/** The brand's logo as a crisp vector (any size). Filled shapes (simple-icons) or line drawings (Arcticons, for games). */
export function BrandLogo({ brand, size, color }: { brand: Brand; size?: number | string; color?: string }) {
  const c = color ?? brandFg(brand);
  if (brand.body) {
    // Static markup from the generated file (checked for plain shapes when generated) – never user input.
    return <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={brand.name} className="brand-logo line" style={{ color: c }} dangerouslySetInnerHTML={{ __html: brand.body }} />;
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={brand.name} className="brand-logo">
      <path d={brand.path} fill={c} />
    </svg>
  );
}
