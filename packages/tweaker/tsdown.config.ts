import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "./src/index.tsx" },
  external: ["react", "react-dom", "react/jsx-runtime"],
  dts: true,
  target: "es2022",
  platform: "browser",
  fixedExtension: false,
});
