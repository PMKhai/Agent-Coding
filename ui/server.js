// ui/server.js — entrypoint
import { createServer } from "http";
import { WebSocketServer } from "ws";

import { PORT, WORKSPACE } from "./server/lib/paths.js";
import { createApp } from "./server/app.js";
import { attachWebSocket } from "./server/ws.js";
import { startQueueCron } from "./server/state/queue-runtime.js";
import {
  startMemoryIndexer,
  startLinkHealthCheck,
} from "./server/bootstrap.js";
import { migrateProjectMcpFiles } from "./server/lib/mcp-config.js";

import tasksRouter from "./server/routes/tasks.js";
import fixesRouter from "./server/routes/fixes.js";
import catalogRouter from "./server/routes/catalog.js";
import repositoriesRouter from "./server/routes/repositories.js";
import companiesRouter from "./server/routes/companies.js";
import graphRouter from "./server/routes/graph.js";
import queueRouter from "./server/routes/queue.js";
import settingsRouter from "./server/routes/settings.js";
import claudeFsRouter from "./server/routes/claude-fs.js";
import workspaceRouter from "./server/routes/workspace.js";
import createWorkflowsRouter from "./server/routes/workflows.js";
import remoteRouter from "./server/routes/remote.js";
import monitorRouter from "./server/routes/monitor.js";
import modelsRouter from "./server/routes/models.js";
import chatRouter from "./server/routes/chat.js";
import rtkRouter from "./server/routes/rtk.js";
import chromeMcpRouter from "./server/routes/chrome-mcp.js";
import catchAllRouter from "./server/routes/catch-all.js";

const app = createApp();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Mount routers in original-section order. catch-all.js MUST be LAST.
app.use(tasksRouter);
app.use(fixesRouter);
app.use(catalogRouter);
app.use(companiesRouter);
app.use(repositoriesRouter);
app.use(graphRouter);
app.use(queueRouter);
app.use(settingsRouter);
app.use(claudeFsRouter);
app.use(workspaceRouter);
app.use(createWorkflowsRouter(wss));
app.use(remoteRouter);
app.use(monitorRouter);
app.use(chatRouter);
app.use(modelsRouter);
app.use(rtkRouter);
app.use(chromeMcpRouter);
app.use(catchAllRouter);

attachWebSocket(wss);
startQueueCron(wss);

migrateProjectMcpFiles().catch(() => {});

await startMemoryIndexer();
startLinkHealthCheck();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FreeBird Platform UI → http://localhost:${PORT}`);
  console.log(`Workspace: ${WORKSPACE}`);
  console.log(`Queue cron: polling every 5s`);
});
