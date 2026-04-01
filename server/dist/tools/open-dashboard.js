import open from "open";
import { startHttpServer } from "../http/server.js";
let serverInstance = null;
export async function openDashboard() {
    if (!serverInstance) {
        const port = parseInt(process.env.DEVTOOLS_PORT || "3142", 10);
        serverInstance = await startHttpServer(port);
    }
    await open(serverInstance.url);
    return `Dashboard opened at ${serverInstance.url}`;
}
//# sourceMappingURL=open-dashboard.js.map