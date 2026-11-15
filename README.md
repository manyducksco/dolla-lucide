# @manyducks.co/dolla-lucide

The [Lucide]() icon set for [Dolla]().

All icons are exported as Dolla views with names converted to `camelCase`. An icon named `align-horizontal-space-between` is imported as `AlignHorizontalSpaceBetween`.

The version of this package follows the Lucide icon set release version.

An icon that Lucide has renamed can still be imported by its old name, which is marked deprecated in favor of the new one. `Trash2`, for example, is now `Trash`.

## Size and stroke

Each icon takes `size` (24), `stroke` (`"currentColor"`) and `strokeWidth` (2). To set them for a group of icons, put the icons inside `LucideDefaults`:

```tsx
import { LucideDefaults, Pencil, Trash } from "@manyducks.co/dolla-lucide";

<LucideDefaults size={16}>
  <Pencil />
  <Trash strokeWidth={1.5} />
</LucideDefaults>;
```

An icon's own props win over the defaults, and a `LucideDefaults` inside another only changes what it sets.

To make an icon of your own follow the same defaults, read them with `getLucideDefaults`:

```tsx
import type { Context } from "@manyducks.co/dolla";
import { getLucideDefaults, type LucideOptions } from "@manyducks.co/dolla-lucide";

function MyIcon(props: LucideOptions, c: Context) {
  const defaults = getLucideDefaults(c);
  const size = props.size ?? defaults.size ?? 24;
  // ...
}
```

`getLucideDefaults` returns `{}` outside any `LucideDefaults`. The defaults are kept in a store made with `createStore`, so this package needs Dolla 6.
