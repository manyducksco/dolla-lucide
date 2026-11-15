import { camelCase, upperFirst } from "lodash-es";
import { exists, mkdir, readdir, rm } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const iconsPath = resolve(import.meta.dir, "./icons");
const tmpPath = resolve(import.meta.dir, "../tmp");
const distPath = resolve(import.meta.dir, "../dist");

// 1. Create dist & tmp folders if they don't exist.
const distExists = await exists(distPath);
if (!distExists) {
  await mkdir(distPath, { recursive: true });
} else {
  await rm(distPath, { recursive: true, force: true });
  await mkdir(distPath, { recursive: true });
}

const tmpExists = await exists(tmpPath);
if (!tmpExists) {
  await mkdir(tmpPath, { recursive: true });
} else {
  await rm(tmpPath, { recursive: true, force: true });
  await mkdir(tmpPath, { recursive: true });
}

// 2. Read all .svg items in the `icons` folder.
const iconFiles = await readdir(iconsPath).then((paths) =>
  paths
    .filter((p) => extname(p).toLowerCase() === ".svg")
    .map((p) => Bun.file(resolve(iconsPath, p))),
);

// Collect names and paths for an index file.
const imports = new Map<string, string>();

/** Other names of an icon, from its metadata: mostly the names it had before Lucide renamed it. */
type Alias = { name: string; icon: string; path: string; deprecated: boolean };
const aliases: Alias[] = [];

// Process individual icons.
for (const file of iconFiles) {
  const fileName = basename(file.name!, extname(file.name!));
  const name = upperFirst(camelCase(fileName));
  if (imports.has(name)) throw new Error(`Two icons are exported as ${name}, one of them "${fileName}".`);
  const content = await file.text();
  const view = createIconView({ name, content });

  imports.set(name, `./icons/${fileName}.js`);

  const meta = Bun.file(resolve(iconsPath, `${fileName}.json`));
  if (await meta.exists()) {
    const { aliases: names = [] } = (await meta.json()) as {
      aliases?: (string | { name: string; deprecated?: boolean })[];
    };
    for (const alias of names) {
      const aliasName = typeof alias === "string" ? alias : alias.name;
      const deprecated = typeof alias !== "string" && alias.deprecated === true;
      aliases.push({ name: upperFirst(camelCase(aliasName)), icon: name, path: `./icons/${fileName}.js`, deprecated });
    }
  }

  await Bun.write(resolve(tmpPath, `./icons/${fileName}.tsx`), view);
}

// Write the defaults: what `LucideDefaults` sets, and how the icons find it. In a file of its own, since the icons
// and the index (which exports the icons) both need it.
await Bun.write(
  resolve(tmpPath, "defaults.ts"),
  `import { addStore, createStore, getStore, type Context, type MaybeGetter } from "@manyducks.co/dolla";

/** What an icon takes, and what \`LucideDefaults\` sets for the icons inside it. */
export type LucideOptions = {
  size?: MaybeGetter<string | number>;
  stroke?: MaybeGetter<string>;
  strokeWidth?: MaybeGetter<number>;
};

export type LucideDefaultsProps = LucideOptions & {
  children: any;
};

/**
 * The defaults in force inside a \`LucideDefaults\`, which the icons inside it look up. Outside any, they're empty.
 */
const LucideDefaultsStore = createStore<LucideOptions>("LucideDefaults", { default: {} });

/**
 * The defaults set by the \`LucideDefaults\` around \`c\`, or \`{}\` when there's none. The icons use this; so can
 * an icon of your own that should size and stroke like them:
 *
 *     function MyIcon(props: LucideOptions, c: Context) {
 *       const defaults = getLucideDefaults(c);
 *       const size = props.size ?? defaults.size ?? 24;
 *       ...
 */
export function getLucideDefaults(c: Context): LucideOptions {
  return getStore(c, LucideDefaultsStore);
}

/**
 * Sets default icon props for the icons inside it. What it leaves unset comes from a \`LucideDefaults\` further
 * out, if there is one.
 */
export function LucideDefaults(props: LucideDefaultsProps, c: Context) {
  const { children, ...options } = props;
  // Read before this one's defaults are added, so they're the defaults from further out.
  addStore(c, LucideDefaultsStore, { ...getLucideDefaults(c), ...options });
  return children;
}
`,
);

// Write the aliases, so an icon Lucide renamed can still be imported by its old name. An alias that becomes the same
// export name as an icon (`scale-3-d` for `scale-3d`) is already covered.
const aliasExports = new Map<string, Alias>();
for (const alias of aliases) {
  if (imports.has(alias.name) || aliasExports.has(alias.name)) continue;
  aliasExports.set(alias.name, alias);
}
const aliasTargets = new Map<string, string>();
for (const alias of aliasExports.values()) aliasTargets.set(alias.icon, alias.path);
await Bun.write(
  resolve(tmpPath, "aliases.ts"),
  `${[...aliasTargets.entries()].map(([icon, path]) => `import { ${icon} } from "${path}";`).join("\n")}

${[...aliasExports.values()]
  .map(
    (alias) =>
      `${alias.deprecated ? `/** @deprecated Renamed to \`${alias.icon}\`. */\n` : `/** Another name for \`${alias.icon}\`. */\n`}export const ${alias.name} = ${alias.icon};`,
  )
  .join("\n")}
`,
);

// Write index file.
await Bun.write(
  resolve(tmpPath, "index.tsx"),
  `${[...imports.entries()]
    .map(([name, path]) => `export { ${name} } from "${path}";`)
    .join("\n")}

export * from "./aliases.js";
export { LucideDefaults, getLucideDefaults } from "./defaults.js";
export type { LucideDefaultsProps, LucideOptions } from "./defaults.js";
`,
);

type IconViewOptions = {
  name: string;
  content: string;
};
function createIconView(options: IconViewOptions): string {
  return `import type { Context } from "@manyducks.co/dolla";
import { getLucideDefaults, type LucideOptions } from "../defaults.js";

export function ${options.name}(props: LucideOptions, c: Context) {
  const options = getLucideDefaults(c);
  return (
    ${options.content
      .replace(/width=".*?"/, `width={props.size ?? options.size ?? 24}`)
      .replace(/height=".*?"/, `height={props.size ?? options.size ?? 24}`)
      .replace(
        /stroke=".*?"/,
        `stroke={props.stroke ?? options.stroke ?? "currentColor"}`,
      )
      .replace(
        /stroke-width=".*?"/,
        `stroke-width={props.strokeWidth ?? options.strokeWidth ?? 2}`,
      )
      .trim()}
  );
}
`;
}
