import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  charset: "utf8",
  legalComments: "inline",
  minify: false,
  write: false,
});

const js = result.outputFiles[0].text;
const html = readFileSync("src/index.html", "utf8").replace("/*__BUNDLE__*/", () => js);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/sehatcard.html", html);
writeFileSync("dist/index.html", '<!DOCTYPE html><meta http-equiv="refresh" content="0; url=sehatcard.html">');
console.log("Built dist/sehatcard.html (" + html.length + " bytes)");
