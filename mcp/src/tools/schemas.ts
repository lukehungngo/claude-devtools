import { z } from "zod";

export const RangeSchema = z.enum(["24h", "7d", "30d", "90d", "all"]);
export const SessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
export const LimitSchema = z.number().int().positive().max(500).default(50);
export const ProjectSchema = z.string().min(1).max(200).optional();
