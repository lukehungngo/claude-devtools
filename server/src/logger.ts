import pino from "pino";
import path from "path";
import fs from "fs";

const LOG_DIR = path.join(
  process.env.HOME || "/tmp",
  ".claude-devtools",
  "logs"
);

// Ensure log directory exists
fs.mkdirSync(LOG_DIR, { recursive: true });

const logFile = path.join(LOG_DIR, "server.log");

const streams: pino.StreamEntry[] = [
  // Pretty console output in dev
  { level: "info", stream: process.stdout },
  // File output — all levels including debug
  {
    level: "debug",
    stream: fs.createWriteStream(logFile, { flags: "a" }),
  },
];

export const logger = pino(
  {
    level: "debug",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  pino.multistream(streams)
);

export const LOG_FILE_PATH = logFile;

// Child loggers for subsystems
export const sessionLog = logger.child({ subsystem: "session" });
export const permissionLog = logger.child({ subsystem: "permission" });
export const parserLog = logger.child({ subsystem: "parser" });
export const wsLog = logger.child({ subsystem: "websocket" });
export const httpLog = logger.child({ subsystem: "http" });
