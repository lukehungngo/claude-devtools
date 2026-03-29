import { startHttpServer } from "./http/server.js";
import { httpLog } from "./logger.js";

const port = parseInt(process.env.DEVTOOLS_PORT || "3142", 10);

startHttpServer(port).then(({ url }) => {
  httpLog.info({ url, port }, "Claude DevTools HTTP server running");
});
