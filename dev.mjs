import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || "dev";
if (!["dev", "preview"].includes(mode)) throw new Error("Use dev or preview.");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
}
function launch(args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
}
if (mode === "dev") {
  const resolveFrontend = createRequire(join(root, "frontend", "package.json"));
  const vite = join(
    dirname(resolveFrontend.resolve("vite/package.json")),
    "bin",
    "vite.js",
  );
  launch([join(root, "backend", "src", "server.mjs")]);
  launch([vite, "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
    cwd: join(root, "frontend"),
  });
} else {
  launch([join(root, "backend", "src", "server.mjs")], {
    env: { ...process.env, PORT: process.env.PORT || "4173" },
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
