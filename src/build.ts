import type { Context, MaybeGetter } from "@manyducks.co/dolla";
import { camelCase, upperFirst } from "lodash-es";
import { exists, mkdir, readdir, rm } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const LUCIDE_ICON_OPTIONS = "__lucide_icon_options__";

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

// Process individual icons.
for (const file of iconFiles) {
  const fileName = basename(file.name!, extname(file.name!));
  const name = upperFirst(camelCase(fileName));
  const content = await file.text();
  const view = createIconView({ name, content });

  imports.set(name, `./icons/${fileName}.js`);

  await Bun.write(resolve(tmpPath, `./icons/${fileName}.tsx`), view);
}

// Write index file.
await Bun.write(
  resolve(tmpPath, "index.tsx"),
  `
import type { Context, MaybeGetter, Renderable } from "@manyducks.co/dolla";

${[...imports.entries()]
  .map(([name, path]) => `export { ${name} } from "${path}";`)
  .join("\n")}

export type LucideDefaultsProps = {
  size?: MaybeGetter<string | number>;
  stroke?: MaybeGetter<string>;
  strokeWidth?: MaybeGetter<number>;
  children: any;
};

/**
 * Sets default icon props for this context.
 */
export function LucideDefaults(props: LucideDefaultsProps, c: Context) {
  const parent = c["${LUCIDE_ICON_OPTIONS}"];
  const {children, ...options} = props;
  c["${LUCIDE_ICON_OPTIONS}"] = Object.assign(parent ? Object.create(parent) : {}, options);
  return children;
}
`,
);

type IconViewOptions = {
  name: string;
  content: string;
};
function createIconView(options: IconViewOptions): string {
  return `import type { Context, MaybeGetter } from "@manyducks.co/dolla";

type ${options.name}Props = {
  size?: MaybeGetter<string | number>;
  stroke?: MaybeGetter<string>;
  strokeWidth?: MaybeGetter<number>;
}

export function ${options.name}(this: Context, props: ${options.name}Props) {
  const options = this["${LUCIDE_ICON_OPTIONS}"] as ${options.name}Props | undefined;
  return (
    ${options.content
      .replace(/width=".*?"/, `width={props.size ?? options?.size ?? 24}`)
      .replace(/height=".*?"/, `height={props.size ?? options?.size ?? 24}`)
      .replace(
        /stroke=".*?"/,
        `stroke={props.stroke ?? options?.stroke ?? "currentColor"}`,
      )
      .replace(
        /stroke-width=".*?"/,
        `stroke-width={props.strokeWidth ?? options?.strokeWidth ?? 2}`,
      )
      .trim()}
  );
}
`;
}
