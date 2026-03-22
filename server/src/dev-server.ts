import { startHttpServer } from "./http/server.js";

const port = parseInt(process.env.DEVTOOLS_PORT || "3142", 10);

startHttpServer(port).then(({ url }) => {
  console.log(`Claude DevTools HTTP server running at ${url}`);
});
