// Build step: bundle the ES modules (build-time dependency: esbuild) into one
// IIFE and inline it into index.html, producing a single zero-dependency,
// fully-offline dist/sehatcard.html. The OUTPUT has no runtime dependencies.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  charset: "utf8",            // keep Hindi/Kannada strings readable in output
  legalComments: "inline",   // preserve the MIT header from the QR library
  minify: false,             // flip to true for a smaller shippable file
  write: false,
});

const js = result.outputFiles[0].text;
const html = readFileSync("src/index.html", "utf8").replace("/*__BUNDLE__*/", () => js);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/sehatcard.html", html);
console.log("Built dist/sehatcard.html (" + html.length + " bytes)");
