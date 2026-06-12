import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  outfile: "dist/app.js",
});

copyFileSync("src/index.html", "dist/index.html");
copyFileSync("src/style.css", "dist/style.css");
copyFileSync("src/htaccess", "dist/.htaccess");

// Nur für lokales Testen — config.json ist gitignored und wird auf dem
// Webspace einmalig von Hand hinterlegt.
if (existsSync("config.json")) copyFileSync("config.json", "dist/config.json");

console.log("Build fertig → dist/");
