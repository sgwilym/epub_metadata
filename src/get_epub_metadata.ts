import {
  BlobWriter,
  TextWriter,
  ZipReader,
} from "https://deno.land/x/zipjs@v2.6.60/index.js";
import { parse } from "https://deno.land/x/xml@2.0.4/mod.ts";

type ParsedEpubContainer = {
  rootfiles: {
    rootfile: {
      "@full-path": string;
    };
  };
};

type Node = { "@id": string; "#text": string };

type ParsedOpf = {
  metadata: {
    "dc:title": string | Node | Node[];
    "dc:creator"?: string | Node | Node[];
    "dc:language": string | Node | Node[];
    "dc:date"?: string;
    "dc:identifier": {
      "#text": string;
      "@id": string;
    };
  };
  manifest: {
    item: {
      "@id": string;
      "@href": string;
      "@media-type": string;
      "#text": string | null;
    }[];
  };
};

type EpubMetadata = {
  title: string;
  creators: string[] | undefined;
  language: string;
  identifier: { type: string; id: string };
  date: Date | undefined;
  cover: Blob | undefined;
};

function firstOfNode(node: string | Node | Node[]): string {
  if (typeof node === "string") {
    return node;
  }

  if (Array.isArray(node)) {
    return node[0]["#text"];
  }

  return node["#text"];
}

function manyOfNode(node: string | Node | Node[]): string[] {
  if (typeof node === "string") {
    return [node];
  }

  if (Array.isArray(node)) {
    return node.map((node) => node["#text"]);
  }

  return [node["#text"]];
}

export async function getEpubMetadata(
  readable: ReadableStream<Uint8Array>,
): Promise<EpubMetadata> {
  const zipReader = new ZipReader(readable);

  const entries = await zipReader.getEntries();

  const metaInfContainerEntry = entries.find((entry) =>
    entry.filename === "META-INF/container.xml"
  );

  if (!metaInfContainerEntry) {
    throw new Error("Couldn't get META-INF/container");
  }

  const containerTextWriter = new TextWriter();

  await metaInfContainerEntry.getData(containerTextWriter);

  const containerXml = await containerTextWriter.getData();

  const containerXmlParsed = parse(containerXml);

  const rootFilePath: string =
    (containerXmlParsed["container"] as unknown as ParsedEpubContainer)[
      "rootfiles"
    ]["rootfile"][
      "@full-path"
    ];

  const rootFileEntry = entries.find((entry) =>
    entry.filename === rootFilePath
  );

  if (!rootFileEntry) {
    throw new Error("Root file not found!");
  }

  const rootFileTextWriter = new TextWriter();

  await rootFileEntry.getData(rootFileTextWriter);

  const rootfileXml = await rootFileTextWriter.getData();

  const rootFileParsed = parse(rootfileXml);

  const opf = rootFileParsed["package"] as unknown as ParsedOpf;

  const metadata: EpubMetadata = {
    title: firstOfNode(opf.metadata["dc:title"]),
    creators: opf.metadata["dc:creator"]
      ? manyOfNode(opf.metadata["dc:creator"])
      : undefined,
    language: firstOfNode(opf.metadata["dc:language"]),
    identifier: {
      type: opf.metadata["dc:identifier"]["@id"],
      id: opf.metadata["dc:identifier"]["#text"],
    },
    date: opf.metadata["dc:date"]
      ? new Date(opf.metadata["dc:date"])
      : undefined,
    cover: undefined,
  };

  const coverItem = opf.manifest.item.find((item) => item["@id"] === "cover");

  if (!coverItem) {
    return metadata;
  }

  const coverBlobWriter = new BlobWriter();

  const coverZipEntry = entries.find((entry) =>
    entry.filename === `EPUB/${coverItem["@href"]}`
  );

  if (!coverZipEntry) {
    return metadata;
  }

  await coverZipEntry.getData(coverBlobWriter);

  metadata.cover = await coverBlobWriter.getData();

  return metadata;
}
