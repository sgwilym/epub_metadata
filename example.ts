import { getEpubMetadata } from "./mod.ts";
import { join } from "https://deno.land/std@0.170.0/path/mod.ts";

for await (const entry of Deno.readDir("./sample_epubs")) {
  if (entry.isDirectory) {
    continue;
  }

  const epubZip = await Deno.open(join("./sample_epubs", entry.name));

  try {
    const metadata = await getEpubMetadata(epubZip.readable);

    console.log(metadata);
  } catch (err) {
    console.group("❌", entry.name, "failed");
    console.log(err.message);
    console.groupEnd();
  }
}

Deno.exit(0);
