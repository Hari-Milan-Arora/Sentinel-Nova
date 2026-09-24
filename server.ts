import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { getPlanningProfile, savePlanningProfile, validatePlanningProfile } from "./server/profileStore";
import {
  getTasksByUser,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  reopenTask,
  validateTaskInput,
} from "./server/taskStore";
import {
  getGoalsByUser,
  getGoalById,
  createGoal,
  updateGoal,
  deleteGoal,
  completeGoal,
  archiveGoal,
  validateGoalInput,
} from "./server/goalStore";
import {
  getProjectsByUser,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  completeProject,
  archiveProject,
  validateProjectInput,
  unassignGoalFromProjects,
} from "./server/projectStore";
import {
  getUserCalendarStatus,
  getCalendars,
  updateCalendarSelection,
  connectCalendar,
  disconnectCalendar,
  syncCalendarEvents,
  getCachedEvents,
} from "./server/calendarStore";
import {
  calculateAvailability,
  timeStringToMinutes,
  minutesToTimeString,
  minutesToDisplayTime,
  mergeIntervals,
  normalizeCalendarEvent,
  findCandidateWindowsForTask,
} from "./src/utils/availabilityEngine";
import {
  novaOrchestrator,
  agentRegistry,
  AgentRequest,
  geminiModelRouter,
  SchedulingResult,
  SchedulingEvaluation,
  toolManager,
  toolRegistry,
  recoveryAgent,
  chiefOfStaffWorkflow,
} from "./server/agents";
import {
  getMemoriesByUser,
  getMemoryById,
  createMemory,
  updateMemory,
  archiveMemory,
  deleteMemory,
  retrieveRelevantMemories,
  validateMemoryInput,
} from "./server/memoryStore";
import {
  classifySensitivity,
  normalizeMemoryContent,
  canOverwriteAuthority,
  detectDuplicate,
} from "./server/memorySafety";
import { MemorySource } from "./server/agents/agents/memoryTypes";

export {
  getUserCalendarStatus,
  getCalendars,
  updateCalendarSelection,
  connectCalendar,
  disconnectCalendar,
  syncCalendarEvents,
  getCachedEvents,
  calculateAvailability,
  timeStringToMinutes,
  minutesToTimeString,
  minutesToDisplayTime,
  mergeIntervals,
  normalizeCalendarEvent,
  findCandidateWindowsForTask,
  novaOrchestrator,
  agentRegistry,
};

const AUTH_COOKIE = "sentinel_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type AuthUser = { id: string; email: string; name: string; picture?: string };

function signSession(user: AuthUser) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(value?: string): AuthUser | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthUser & { exp: number };
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: parsed.id, email: parsed.email, name: parsed.name, picture: parsed.picture };
  } catch { return null; }
}

function isSecureRequest(req: express.Request): boolean {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const isHttps =
    req.secure ||
    (typeof forwardedProto === "string" && forwardedProto.toLowerCase().includes("https")) ||
    req.headers["x-forwarded-ssl"] === "on" ||
    process.env.APP_URL?.startsWith("https://") ||
    process.env.NODE_ENV === "production";
  return Boolean(isHttps);
}

function getSession(req: express.Request) {
  const raw = req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(`${AUTH_COOKIE}=`))?.slice(AUTH_COOKIE.length + 1);
  return verifySession(raw);
}

function setSession(req: express.Request, res: express.Response, user: AuthUser) {
  const isSecure = isSecureRequest(req);
  const cookieFlags = isSecure
    ? "; SameSite=None; Secure; Partitioned"
    : "; SameSite=Lax";
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=${signSession(user)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}${cookieFlags}`
  );
}

function clearSession(req: express.Request, res: express.Response) {
  const isSecure = isSecureRequest(req);
  const cookieFlags = isSecure
    ? "; SameSite=None; Secure; Partitioned"
    : "; SameSite=Lax";
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0${cookieFlags}`
  );
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getSession(req);
  if (!user) return res.status(401).json({ error: "Authentication required." });
  (req as express.Request & { user: AuthUser }).user = user;
  next();
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const PORT = Number(process.env.PORT || 3000);
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/auth/me", (req, res) => {
    const user = getSession(req);
    if (!user) return res.status(401).json({ authenticated: false, user: null });
    res.json({ authenticated: true, user });
  });

  app.post("/api/auth/google", async (req, res) => {
    try {
      const { credential } = req.body as { credential?: string };
      const rawClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
      const clientId = rawClientId?.trim();
      if (!clientId) return res.status(503).json({ error: "Google authentication is not configured on the server." });
      if (!credential) return res.status(400).json({ error: "Missing Google credential." });

      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!response.ok) return res.status(401).json({ error: "Google credential could not be verified." });
      const token = await response.json() as { aud?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; picture?: string; exp?: string };
      if (token.aud?.trim() !== clientId || !token.sub || !token.email || String(token.email_verified) !== "true") {
        return res.status(401).json({ error: "Google identity verification failed." });
      }
      if (token.exp && Number(token.exp) < Math.floor(Date.now() / 1000)) {
        return res.status(401).json({ error: "Google credential has expired." });
      }

      const user: AuthUser = { id: token.sub, email: token.email, name: token.name || token.email.split("@")[0], picture: token.picture };
      setSession(req, res, user);
      res.json({ authenticated: true, user });
    } catch (error) {
      console.error("Google auth failed:", error);
      res.status(500).json({ error: "Unable to complete Google sign-in." });
    }
  });

  app.post("/api/auth/logout", (req, res) => { clearSession(req, res); res.status(204).send(); });

  app.get("/api/profile/planning", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const profile = await getPlanningProfile(user.id);
      res.json({ profile });
    } catch (err) {
      console.error("Failed to fetch planning profile:", err);
      res.status(500).json({ error: "Failed to fetch planning profile." });
    }
  });

  app.post("/api/profile/planning", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const validation = validatePlanningProfile(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }
      const profile = await savePlanningProfile(user.id, req.body);
      res.json({ profile });
    } catch (err) {
      console.error("Failed to save planning profile:", err);
      res.status(500).json({ error: "Failed to save planning profile." });
    }
  });

  app.put("/api/profile/planning", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const validation = validatePlanningProfile(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }
      const profile = await savePlanningProfile(user.id, req.body);
      res.json({ profile });
    } catch (err) {
      console.error("Failed to update planning profile:", err);
      res.status(500).json({ error: "Failed to update planning profile." });
    }
  });

  // Task Management Endpoints
  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const tasks = await getTasksByUser(user.id);
      res.json({ tasks });
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
      res.status(500).json({ error: "Failed to fetch tasks." });
    }
  });

  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const task = await getTaskById(user.id, req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found." });
      }
      res.json({ task });
    } catch (err) {
      console.error("Failed to fetch task:", err);
      res.status(500).json({ error: "Failed to fetch task." });
    }
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const validation = validateTaskInput(req.body, false);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }

      // Validate project existence and ownership if projectId is provided
      if (req.body.projectId !== undefined && req.body.projectId !== null) {
        const rawProjectId = String(req.body.projectId).trim();
        if (rawProjectId.length > 0) {
          const project = await getProjectById(user.id, rawProjectId);
          if (!project) {
            return res.status(400).json({ error: "Referenced project does not exist or does not belong to user." });
          }
        }
      }

      const task = await createTask(user.id, req.body);
      res.status(201).json({ task });
    } catch (err) {
      console.error("Failed to create task:", err);
      res.status(500).json({ error: "Failed to create task." });
    }
  });

  app.put("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const validation = validateTaskInput(req.body, true);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }

      // Validate project existence and ownership if projectId is provided
      if (req.body.projectId !== undefined && req.body.projectId !== null) {
        const rawProjectId = String(req.body.projectId).trim();
        if (rawProjectId.length > 0) {
          const project = await getProjectById(user.id, rawProjectId);
          if (!project) {
            return res.status(400).json({ error: "Referenced project does not exist or does not belong to user." });
          }
        }
      }

      const task = await updateTask(user.id, req.params.id, req.body);
      if (!task) {
        return res.status(404).json({ error: "Task not found." });
      }
      res.json({ task });
    } catch (err) {
      console.error("Failed to update task:", err);
      res.status(500).json({ error: "Failed to update task." });
    }
  });

  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const deleted = await deleteTask(user.id, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Task not found." });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete task:", err);
      res.status(500).json({ error: "Failed to delete task." });
    }
  });

  app.post("/api/tasks/:id/complete", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const task = await completeTask(user.id, req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found." });
      }
      res.json({ task });
    } catch (err) {
      console.error("Failed to complete task:", err);
      res.status(500).json({ error: "Failed to complete task." });
    }
  });

  app.post("/api/tasks/:id/reopen", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const task = await reopenTask(user.id, req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found." });
      }
      res.json({ task });
    } catch (err) {
      console.error("Failed to reopen task:", err);
      res.status(500).json({ error: "Failed to reopen task." });
    }
  });

  // ==========================================
  // GOAL API ENDPOINTS
  // ==========================================
  app.get("/api/goals", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const goals = await getGoalsByUser(user.id);
      res.json({ goals });
    } catch (err) {
      console.error("Failed to fetch goals:", err);
      res.status(500).json({ error: "Failed to fetch goals." });
    }
  });

  app.get("/api/goals/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const goal = await getGoalById(user.id, req.params.id);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found." });
      }
      res.json({ goal });
    } catch (err) {
      console.error("Failed to fetch goal:", err);
      res.status(500).json({ error: "Failed to fetch goal." });
    }
  });

  app.post("/api/goals", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const validation = validateGoalInput(req.body, false);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }
      const goal = await createGoal(user.id, req.body);
      res.status(201).json({ goal });
    } catch (err) {
      console.error("Failed to create goal:", err);
      res.status(500).json({ error: "Failed to create goal." });
    }
  });

  app.put("/api/goals/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const validation = validateGoalInput(req.body, true);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }
      const goal = await updateGoal(user.id, req.params.id, req.body);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found." });
      }
      res.json({ goal });
    } catch (err) {
      console.error("Failed to update goal:", err);
      res.status(500).json({ error: "Failed to update goal." });
    }
  });

  app.delete("/api/goals/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const deleted = await deleteGoal(user.id, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Goal not found." });
      }
      // Safe relation: unassign goal from any projects that belonged to it
      await unassignGoalFromProjects(user.id, req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete goal:", err);
      res.status(500).json({ error: "Failed to delete goal." });
    }
  });

  app.post("/api/goals/:id/complete", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const goal = await completeGoal(user.id, req.params.id);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found." });
      }
      res.json({ goal });
    } catch (err) {
      console.error("Failed to complete goal:", err);
      res.status(500).json({ error: "Failed to complete goal." });
    }
  });

  app.post("/api/goals/:id/archive", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const goal = await archiveGoal(user.id, req.params.id);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found." });
      }
      res.json({ goal });
    } catch (err) {
      console.error("Failed to archive goal:", err);
      res.status(500).json({ error: "Failed to archive goal." });
    }
  });

  // ==========================================
  // PROJECT API ENDPOINTS
  // ==========================================
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const projects = await getProjectsByUser(user.id);
      res.json({ projects });
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      res.status(500).json({ error: "Failed to fetch projects." });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const project = await getProjectById(user.id, req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }
      res.json({ project });
    } catch (err) {
      console.error("Failed to fetch project:", err);
      res.status(500).json({ error: "Failed to fetch project." });
    }
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const validation = validateProjectInput(req.body, false);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }
      const project = await createProject(user.id, req.body);
      res.status(201).json({ project });
    } catch (err: any) {
      console.error("Failed to create project:", err);
      res.status(err.message?.includes("not belong") ? 400 : 500).json({
        error: err.message || "Failed to create project.",
      });
    }
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const validation = validateProjectInput(req.body, true);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      }
      const project = await updateProject(user.id, req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }
      res.json({ project });
    } catch (err: any) {
      console.error("Failed to update project:", err);
      res.status(err.message?.includes("not belong") ? 400 : 500).json({
        error: err.message || "Failed to update project.",
      });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const deleted = await deleteProject(user.id, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Project not found." });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete project:", err);
      res.status(500).json({ error: "Failed to delete project." });
    }
  });

  app.post("/api/projects/:id/complete", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const project = await completeProject(user.id, req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }
      res.json({ project });
    } catch (err) {
      console.error("Failed to complete project:", err);
      res.status(500).json({ error: "Failed to complete project." });
    }
  });

  app.post("/api/projects/:id/archive", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const project = await archiveProject(user.id, req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }
      res.json({ project });
    } catch (err) {
      console.error("Failed to archive project:", err);
      res.status(500).json({ error: "Failed to archive project." });
    }
  });

  // Calendar Integration Endpoints (Day 4)
  app.get("/api/calendar/status", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const status = getUserCalendarStatus(user.id);
      res.json(status);
    } catch (err) {
      console.error("Failed to get calendar status:", err);
      res.status(500).json({ error: "Failed to get calendar status." });
    }
  });

  app.get("/api/calendar/calendars", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const calendars = getCalendars(user.id);
      res.json({ calendars });
    } catch (err) {
      console.error("Failed to get calendars:", err);
      res.status(500).json({ error: "Failed to get calendars." });
    }
  });

  app.put("/api/calendar/calendars/selection", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { selectedCalendarIds } = req.body;
      if (!Array.isArray(selectedCalendarIds)) {
        return res.status(400).json({ error: "selectedCalendarIds must be an array of string IDs." });
      }
      const calendars = updateCalendarSelection(user.id, selectedCalendarIds);
      void syncCalendarEvents(user.id);
      res.json({ calendars, selectedCalendarIds });
    } catch (err) {
      console.error("Failed to update calendar selection:", err);
      res.status(500).json({ error: "Failed to update calendar selection." });
    }
  });

  app.post("/api/calendar/connect", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { accessToken } = req.body;
      if (!accessToken || typeof accessToken !== "string") {
        return res.status(400).json({ error: "Missing or invalid OAuth access token." });
      }
      const result = await connectCalendar(user.id, accessToken, user.email);
      if (!result.success) {
        return res.status(400).json({ error: result.error || "Failed to connect Google Calendar." });
      }
      const status = getUserCalendarStatus(user.id);
      res.json({ status, calendars: result.calendars });
    } catch (err) {
      console.error("Failed to connect calendar:", err);
      res.status(500).json({ error: "Failed to connect Google Calendar." });
    }
  });

  app.post("/api/calendar/disconnect", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      disconnectCalendar(user.id);
      const status = getUserCalendarStatus(user.id);
      res.json({ status, message: "Calendar disconnected successfully." });
    } catch (err) {
      console.error("Failed to disconnect calendar:", err);
      res.status(500).json({ error: "Failed to disconnect calendar." });
    }
  });

  app.get("/api/calendar/events", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { timeMin, timeMax, timeZone, refresh } = req.query as Record<string, string | undefined>;

      if (refresh === "true") {
        const syncResult = await syncCalendarEvents(user.id, timeMin, timeMax, timeZone);
        if (syncResult.error) {
          return res.status(401).json({ error: syncResult.error, events: syncResult.events });
        }
        return res.json({ events: syncResult.events });
      }

      const events = getCachedEvents(user.id, timeMin, timeMax);
      res.json({ events });
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
      res.status(500).json({ error: "Failed to fetch calendar events." });
    }
  });

  app.get("/api/calendar/availability", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];

      const profile = await getPlanningProfile(user.id);
      const calendarStatus = getUserCalendarStatus(user.id);
      const events = getCachedEvents(user.id);
      const tasks = await getTasksByUser(user.id);

      const availability = calculateAvailability({
        dateStr,
        profile,
        events,
        selectedCalendarIds: calendarStatus.selectedCalendarIds,
        tasks,
      });

      res.json({ availability });
    } catch (err) {
      console.error("Failed to compute availability:", err);
      res.status(500).json({ error: "Failed to compute availability." });
    }
  });

  function isSchedulingIntent(text: string): boolean {
    if (!text || typeof text !== "string") return false;
    const lower = text.toLowerCase();
    return (
      lower.includes("when should i work") ||
      lower.includes("when can i work") ||
      lower.includes("when can i") ||
      lower.includes("when to do") ||
      lower.includes("find a free slot") ||
      lower.includes("find a slot") ||
      lower.includes("free slot") ||
      lower.includes("free window") ||
      lower.includes("time slot") ||
      lower.includes("time block") ||
      lower.includes("schedule my") ||
      lower.includes("schedule this") ||
      lower.includes("schedule the") ||
      lower.includes("find time for") ||
      lower.includes("find time to") ||
      lower.includes("find a 2 hour window") ||
      lower.includes("find a window") ||
      lower.includes("best time to work") ||
      lower.includes("why should i work on this at") ||
      lower.includes("reschedule")
    );
  }

  app.post("/api/chat", requireAuth, async (req, res) => {
    const { message, tasks, goals } = req.body;
    try {
      // Natural Language Nova Chat Scheduling Intent Routing (Day 5B.4)
      if (isSchedulingIntent(message)) {
        const user = (req as express.Request & { user: AuthUser }).user;
        const agentRequest: AgentRequest = {
          requestId: `req_${crypto.randomUUID()}`,
          userRequest: message.trim(),
          preferredAgentId: "agent.scheduler",
          scope: {
            includeCalendar: true,
            includeAvailability: true,
            activeTasksOnly: true,
            includeMemory: true,
          },
        };

        const orchestration = await novaOrchestrator.orchestrate(agentRequest, {
          userId: user.id,
        });

        if (orchestration.success) {
          const schedulerResult = orchestration.agentResults.find(
            (r) => r.agentId === "agent.scheduler"
          );
          const schedOutput = (schedulerResult?.output || {}) as SchedulingResult;
          const evalItem = schedOutput?.evaluations?.[0];

          if (evalItem && evalItem.bestWindow) {
            const best = evalItem.bestWindow;
            const timeSpan = `${best.window.startFormatted}–${best.window.endFormatted}`;
            const altText = evalItem.alternativeWindows?.[0]
              ? `\n\nAlternative: ${evalItem.alternativeWindows[0].window.startFormatted}–${evalItem.alternativeWindows[0].window.endFormatted}.`
              : "";
            const confidencePct = Math.round((evalItem.confidence || best.score) * 100);
            const rationale =
              evalItem.reasoning ||
              (evalItem as any).rationale ||
              "It fits your preferred focus period, avoids calendar conflicts, and gives the task enough uninterrupted time.";

            const content = `I recommend ${timeSpan}.\n\n${rationale}\n\nConfidence: ${confidencePct}%.${altText}`;

            return res.json({
              content,
              explainability: {
                why: rationale,
                benefits: [
                  "Fits your preferred focus period",
                  "Avoids calendar conflicts",
                  "Gives the task uninterrupted focus",
                ],
                risks: evalItem.tradeoffs || [
                  "Plans can adjust when new commitments appear",
                ],
                nextSteps: ["Confirm schedule recommendation if desired"],
              },
              confidenceScore: {
                overall: confidencePct,
                reasoningQuality: confidencePct,
                dataQuality: 90,
                riskLevel: "low" as const,
              },
              actionProposal: orchestration.proposedActions?.[0] || null,
            });
          } else {
            const unassigned = schedOutput?.unassignedTasks?.[0];
            const reason =
              unassigned?.reason ||
              "No suitable window found within your working hours and availability constraints.";
            const content = `No suitable window found.\n\n${reason}\n\nConfidence: 80%.`;

            return res.json({
              content,
              explainability: {
                why: reason,
                benefits: ["Guarantees no schedule collision with existing commitments"],
                risks: ["Task may need deadline adjustment or smaller duration"],
                nextSteps: ["Shorten task estimated duration or expand availability"],
              },
              confidenceScore: {
                overall: 80,
                reasoningQuality: 85,
                dataQuality: 85,
                riskLevel: "medium" as const,
              },
              actionProposal: null,
            });
          }
        }
      }

      let responseContent = "";
      let hasGemini = false;
      if (process.env.GEMINI_API_KEY) {
        try {
          const systemContext = `You are Sentinel Nova, an AI Chief of Staff. Think before acting, prioritize clearly, explain uncertainty, and keep recommendations concise.\n\nActive Tasks: ${JSON.stringify(tasks || [])}\nTarget Goals: ${JSON.stringify(goals || [])}\n\nUser message: "${message}"`;
          const response = await geminiModelRouter.generateContent({
            contents: systemContext,
          });
          if (response?.ok && response?.text) {
            responseContent = response.text;
            hasGemini = true;
          }
        } catch (geminiError) {
          console.error("Gemini invocation failed:", geminiError);
        }
      }

      if (!hasGemini) {
        const lowercaseMsg = String(message || "").toLowerCase();
        if (lowercaseMsg.includes("prioritize") || lowercaseMsg.includes("schedule") || lowercaseMsg.includes("task")) {
          responseContent = `I reviewed your active workload.\n\n### Nova recommendation\nStart with the highest-impact task that protects a current goal or deadline. Defer low-priority work until the critical path is secure.\n\n### Next move\nReserve a focused block, complete the first meaningful milestone, then reassess the remaining workload.`;
        } else {
          responseContent = `I have your current goals and task context. Tell me what outcome you want to reach, and I will help turn it into a realistic plan with priorities, time constraints and recovery options.`;
        }
      }

      res.json({
        content: responseContent,
        explainability: { why: "Recommendation generated from your current planning context.", benefits: ["Clearer prioritization", "Earlier visibility into schedule risk"], risks: ["Plans can change when new commitments appear"], nextSteps: ["Review the recommended next action"] },
        confidenceScore: { overall: 90, reasoningQuality: 89, dataQuality: 86, riskLevel: "low" as const }
      });
    } catch (error) {
      console.error("API Chat handler crashed:", error);
      res.status(500).json({ error: "Nova could not complete the request." });
    }
  });

  // Memory Management Endpoints (Day 5B.3)
  app.get("/api/memory", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { status, type } = req.query;
      const memories = await getMemoriesByUser(user.id, {
        status: status as any,
        type: type as any,
      });
      res.json({ success: true, memories });
    } catch (err: any) {
      console.error("Error retrieving user memories:", err);
      res.status(500).json({ error: "Failed to retrieve memories." });
    }
  });

  app.get("/api/memory/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const memory = await getMemoryById(user.id, req.params.id);
      if (!memory) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }
      res.json({ success: true, memory });
    } catch (err: any) {
      console.error("Error retrieving memory item:", err);
      res.status(500).json({ error: "Failed to retrieve memory item." });
    }
  });

  app.post("/api/memory", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;

      // Trust boundary: Client cannot specify a foreign userId
      if (req.body.userId && req.body.userId !== user.id) {
        return res.status(400).json({ error: "Access Denied: Specifying a foreign userId is strictly forbidden." });
      }

      // Check restricted content before any processing
      const rawContent = typeof req.body.content === 'string' ? req.body.content : '';
      const normalized = normalizeMemoryContent(rawContent);
      const safetyCheck = classifySensitivity(normalized);
      if (safetyCheck.isRestricted) {
        return res.status(400).json({ error: safetyCheck.reason || "Restricted content cannot be persisted." });
      }

      // Trust boundary: Source authority rules
      let source: MemorySource = req.body.source || 'user_explicit';
      if (source === 'user_confirmed' && !req.body.confirmedProposalId && !req.body.isConfirmed) {
        source = 'user_explicit'; // Downgrade to user_explicit if not confirming a proposal
      }

      const isSensitive = req.body.sensitivity === 'sensitive' || safetyCheck.sensitivity === 'sensitive';
      if (isSensitive && !req.body.confirmed && !req.body.isConfirmed) {
        return res.status(400).json({
          error: "Sensitive memory detected: Explicit user confirmation is required to persist sensitive context.",
          requiresConfirmation: true,
          sensitivity: 'sensitive',
        });
      }

      const validation = validateMemoryInput(req.body, false);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors.join(" ") });
      }

      const memory = await createMemory(user.id, {
        ...req.body,
        source,
        sensitivity: isSensitive ? 'sensitive' : 'normal',
      });
      res.status(201).json({ success: true, memory });
    } catch (err: any) {
      console.error("Error creating memory item:", err);
      res.status(400).json({ error: err.message || "Failed to create memory item." });
    }
  });

  app.put("/api/memory/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;

      // Trust boundary: Client cannot specify a foreign userId
      if (req.body.userId && req.body.userId !== user.id) {
        return res.status(400).json({ error: "Access Denied: Specifying a foreign userId is strictly forbidden." });
      }

      // Check ownership first
      const existing = await getMemoryById(user.id, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }

      // Check authority conflict: lower authority cannot overwrite higher authority
      if (req.body.source && !canOverwriteAuthority(existing.source, req.body.source)) {
        return res.status(400).json({
          error: `Authority conflict: '${req.body.source}' cannot overwrite authoritative '${existing.source}' memory.`,
        });
      }

      // Check sensitivity & restricted content if content changed
      if (req.body.content) {
        const normalized = normalizeMemoryContent(req.body.content);
        const safetyCheck = classifySensitivity(normalized);
        if (safetyCheck.isRestricted) {
          return res.status(400).json({ error: safetyCheck.reason || "Restricted content cannot be persisted." });
        }
        const isSensitive = req.body.sensitivity === 'sensitive' || safetyCheck.sensitivity === 'sensitive';
        if (isSensitive && existing.sensitivity !== 'sensitive' && !req.body.confirmed && !req.body.isConfirmed) {
          return res.status(400).json({
            error: "Sensitive memory detected: Explicit user confirmation is required to update with sensitive context.",
            requiresConfirmation: true,
            sensitivity: 'sensitive',
          });
        }
      }

      const validation = validateMemoryInput(req.body, true);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors.join(" ") });
      }

      const updated = await updateMemory(user.id, req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }
      res.json({ success: true, memory: updated });
    } catch (err: any) {
      console.error("Error updating memory item:", err);
      res.status(400).json({ error: err.message || "Failed to update memory item." });
    }
  });

  app.post("/api/memory/:id/archive", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;

      const existing = await getMemoryById(user.id, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }

      const archived = await archiveMemory(user.id, req.params.id);
      if (!archived) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }
      res.json({ success: true, memory: archived });
    } catch (err: any) {
      console.error("Error archiving memory item:", err);
      res.status(500).json({ error: "Failed to archive memory item." });
    }
  });

  app.delete("/api/memory/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;

      // Verify ownership before deleting
      const existing = await getMemoryById(user.id, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }

      const hardDelete = req.query.hard === "true";
      const deleted = await deleteMemory(user.id, req.params.id, hardDelete);
      if (!deleted) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting memory item:", err);
      res.status(500).json({ error: "Failed to delete memory item." });
    }
  });

  app.post("/api/memory/retrieve", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { query, types, limit, minConfidence, includeArchived } = req.body || {};

      // Bounding checks on retrieve input
      const boundedQuery = typeof query === 'string' ? query.slice(0, 500) : '';
      const boundedLimit = Math.min(10, Math.max(1, typeof limit === 'number' ? limit : 5));

      const result = await retrieveRelevantMemories(user.id, {
        query: boundedQuery,
        types,
        limit: boundedLimit,
        minConfidence,
        includeArchived: Boolean(includeArchived),
      });
      res.json({ success: true, memories: result.memories, totalMatched: result.totalMatched });
    } catch (err: any) {
      console.error("Error retrieving relevant memories:", err);
      res.status(500).json({ error: "Failed to retrieve relevant memories." });
    }
  });

  // Additional /api/memories aliases and /api/nova/memory endpoints (Day 5B.3)
  app.get("/api/memories", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { status, type } = req.query;
      const memories = await getMemoriesByUser(user.id, {
        status: status as any,
        type: type as any,
      });
      res.json({ success: true, memories });
    } catch (err: any) {
      console.error("Error retrieving user memories:", err);
      res.status(500).json({ error: "Failed to retrieve memories." });
    }
  });

  app.get("/api/memories/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const memory = await getMemoryById(user.id, req.params.id);
      if (!memory) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }
      res.json({ success: true, memory });
    } catch (err: any) {
      console.error("Error retrieving memory item:", err);
      res.status(500).json({ error: "Failed to retrieve memory item." });
    }
  });

  app.post("/api/memories/:id/archive", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const existing = await getMemoryById(user.id, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }
      const archived = await archiveMemory(user.id, req.params.id);
      if (!archived) {
        return res.status(404).json({ error: "Memory item not found or access denied." });
      }
      res.json({ success: true, memory: archived });
    } catch (err: any) {
      console.error("Error archiving memory item:", err);
      res.status(500).json({ error: "Failed to archive memory item." });
    }
  });

  app.post("/api/nova/memory/retrieve", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { query, types, limit, minConfidence, includeArchived } = req.body || {};
      const boundedQuery = typeof query === 'string' ? query.slice(0, 500) : '';
      const boundedLimit = Math.min(10, Math.max(1, typeof limit === 'number' ? limit : 5));

      const result = await retrieveRelevantMemories(user.id, {
        query: boundedQuery,
        types,
        limit: boundedLimit,
        minConfidence,
        includeArchived: Boolean(includeArchived),
      });
      res.json({ success: true, memories: result.memories, totalMatched: result.totalMatched });
    } catch (err: any) {
      console.error("Error in /api/nova/memory/retrieve:", err);
      res.status(500).json({ error: "Failed to retrieve relevant memories." });
    }
  });

  app.post("/api/nova/memory/propose", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { content, type, importance, tags } = req.body || {};

      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: "Memory content is required to generate a proposal." });
      }

      const normalized = normalizeMemoryContent(content);
      const safetyCheck = classifySensitivity(normalized);
      if (safetyCheck.isRestricted) {
        return res.status(400).json({ error: safetyCheck.reason || "Restricted content cannot be proposed." });
      }

      const existingMemories = await getMemoriesByUser(user.id, { status: 'active' });
      const dupCheck = detectDuplicate(normalized, type || 'preference', existingMemories);

      if (dupCheck.isDuplicate) {
        return res.json({
          success: true,
          status: 'duplicate',
          isDuplicate: true,
          message: "This preference is already actively saved.",
          existingMemoryId: dupCheck.duplicateMemory?.id,
        });
      }

      // Propose creation action - ZERO direct database mutations
      const proposalAction = {
        actionId: `action_mem_prop_${Date.now()}`,
        type: 'MEMORY_CREATE',
        description: `Propose remembering preference: "${normalized.slice(0, 80)}"`,
        target: 'persistent_memory_store',
        parameters: {
          operation: 'create',
          type: type || 'preference',
          content: normalized,
          importance: importance || 'medium',
          confidence: 0.90,
          source: 'user_explicit',
          sensitivity: safetyCheck.sensitivity,
          tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
        },
        riskLevel: 'medium',
        requiresConfirmation: true, // Propose-only mandate
        sourceAgentId: 'agent.memory',
      };

      res.json({
        success: true,
        proposedAction: proposalAction,
        requiresConfirmation: true,
      });
    } catch (err: any) {
      console.error("Error in /api/nova/memory/propose:", err);
      res.status(500).json({ error: "Failed to generate memory proposal." });
    }
  });

  // Nova Multi-Agent Runtime Endpoints (Day 5A)
  app.get("/api/nova/agents", requireAuth, (_req, res) => {
    try {
      const agents = agentRegistry.list();
      res.json({ agents });
    } catch (err) {
      console.error("Failed to list agents:", err);
      res.status(500).json({ error: "Failed to list agents." });
    }
  });

  app.post("/api/nova/orchestrate", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { message, preferredAgentId, scope, parameters } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message string is required." });
      }

      // Day 5B/5C Security Mandate:
      // Allow only verified agents: agent.context_inspector, agent.planner, agent.prioritizer, agent.memory, agent.scheduler, agent.reviewer.
      // Do not allow arbitrary client-supplied agent IDs to execute.
      const allowedAgentIds = [
        "agent.context_inspector",
        "agent.planner",
        "agent.prioritizer",
        "agent.memory",
        "agent.scheduler",
        "agent.reviewer",
      ];
      let agentToRun = "agent.planner";

      if (preferredAgentId && typeof preferredAgentId === "string") {
        if (!allowedAgentIds.includes(preferredAgentId)) {
          return res.status(403).json({
            error: `Access Denied: Only verified Day 5 test agents (${allowedAgentIds.join(", ")}) can be executed directly.`,
          });
        }
        agentToRun = preferredAgentId;
      } else {
        const lower = message.toLowerCase();
        if (
          lower.includes("inspect") ||
          lower.includes("diagnostic") ||
          lower.includes("health") ||
          lower.includes("runtime")
        ) {
          agentToRun = "agent.context_inspector";
        } else if (
          lower.includes("what should i work on first") ||
          lower.includes("what is most important") ||
          lower.includes("what should i prioritize") ||
          lower.includes("which task deserves my attention") ||
          lower.includes("what should i focus on") ||
          lower.includes("which goal needs attention") ||
          lower.includes("what's the most important") ||
          lower.includes("what to do first") ||
          lower.includes("prioritize") ||
          lower.includes("priority") ||
          lower.includes("rank") ||
          lower.includes("order of importance")
        ) {
          agentToRun = "agent.prioritizer";
        } else if (
          lower.includes("remember") ||
          lower.includes("recall") ||
          lower.includes("forget") ||
          lower.includes("memory") ||
          lower.includes("memories") ||
          lower.includes("what do you remember") ||
          lower.includes("what do you know about me") ||
          lower.includes("my preferences") ||
          lower.includes("my preference") ||
          lower.includes("working style") ||
          lower.includes("scheduling preference") ||
          lower.includes("delete memory") ||
          lower.includes("archive memory")
        ) {
          agentToRun = "agent.memory";
        } else if (
          lower.includes("when should i work on") ||
          lower.includes("when can i") ||
          lower.includes("schedule") ||
          lower.includes("reschedule") ||
          lower.includes("find time") ||
          lower.includes("free window") ||
          lower.includes("free slot") ||
          lower.includes("time slot") ||
          lower.includes("time block") ||
          lower.includes("slot") ||
          lower.includes("calendar") ||
          lower.includes("when to do") ||
          lower.includes("why should i work on this at")
        ) {
          agentToRun = "agent.scheduler";
        }
      }

      // For planner, prioritizer, memory, and scheduler agents, scope context appropriately
      const effectiveScope = {
        ...(agentToRun === "agent.planner"
          ? { includeCalendar: true, includeAvailability: true, activeTasksOnly: true, includeMemory: true }
          : agentToRun === "agent.prioritizer"
          ? { activeTasksOnly: true, includeMemory: true }
          : agentToRun === "agent.memory"
          ? { includeMemory: true }
          : agentToRun === "agent.scheduler"
          ? { includeCalendar: true, includeAvailability: true, activeTasksOnly: true, includeMemory: true }
          : {}),
        ...(scope || {}),
      };

      const agentRequest: AgentRequest = {
        requestId: `req_${crypto.randomUUID()}`,
        userRequest: message.trim(),
        preferredAgentId: agentToRun,
        scope: effectiveScope,
        parameters,
      };

      // Strict user isolation: user.id originates solely from verified session
      const orchestration = await novaOrchestrator.orchestrate(agentRequest, {
        userId: user.id,
      });

      res.json({
        success: orchestration.success,
        orchestration,
      });
    } catch (err) {
      console.error("Nova orchestration endpoint error:", err);
      res.status(500).json({ error: "Orchestration request failed." });
    }
  });

  // User-Facing Scheduler API (Day 5B.4 / Day 5C.4)
  const handleScheduleAnalyze = async (req: express.Request, res: express.Response) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;

      // Security Boundary: Client cannot specify a foreign userId
      if (req.body?.userId && req.body.userId !== user.id) {
        return res.status(400).json({
          error: "Access Denied: Specifying a foreign userId is strictly forbidden.",
        });
      }

      const { taskId, horizonDays, strategy } = req.body || {};
      if (!taskId || typeof taskId !== "string" || !taskId.trim()) {
        return res.status(400).json({ error: "taskId string is required." });
      }

      const cleanTaskId = taskId.trim();

      // Task Ownership Validation: Only allow scheduling tasks owned by verified session user
      const task = await getTaskById(user.id, cleanTaskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found or access denied." });
      }

      const horizon =
        typeof horizonDays === "number" && Number.isFinite(horizonDays) && horizonDays > 0
          ? Math.min(30, Math.max(1, Math.round(horizonDays)))
          : 7;

      // Invoke existing SchedulerAgent via novaOrchestrator
      const agentRequest: AgentRequest = {
        requestId: `req_${crypto.randomUUID()}`,
        userRequest: `Schedule task "${task.title}"`,
        preferredAgentId: "agent.scheduler",
        scope: {
          includeCalendar: true,
          includeAvailability: true,
          activeTasksOnly: true,
          includeMemory: true,
        },
        parameters: {
          taskId: task.id,
          horizonDays: horizon,
          ...(strategy ? { strategy } : {}),
        },
      };

      const orchestration = await novaOrchestrator.orchestrate(agentRequest, {
        userId: user.id,
      });

      if (!orchestration.success && orchestration.error) {
        return res.status(500).json({
          error: orchestration.error.message || "Scheduling recommendation could not be generated.",
        });
      }

      const schedulerResult = orchestration.agentResults.find(
        (r) => r.agentId === "agent.scheduler"
      );

      const schedOutput = (schedulerResult?.output || {}) as SchedulingResult;
      const evaluation: SchedulingEvaluation | undefined =
        schedOutput.evaluations?.find((e) => e.taskId === task.id) ||
        schedOutput.evaluations?.[0];

      if (evaluation && evaluation.bestWindow) {
        const best = evaluation.bestWindow;
        const alternatives = (evaluation.alternativeWindows || []).slice(0, 3).map((alt) => ({
          start: alt.suggestedStart,
          end: alt.suggestedEnd,
          timeFormatted: `${alt.window.startFormatted} – ${alt.window.endFormatted}`,
          fit: alt.fit,
          score: Math.round(alt.score * 100),
          reason: alt.reasons?.[0] || "Alternative available window",
        }));

        // Build proposal-only action with strict requiresConfirmation: true
        const proposedAction =
          orchestration.proposedActions?.find(
            (a) => a.type === "SCHEDULE_TASK" && (a.target === task.id || (a.parameters as any)?.taskId === task.id)
          ) ||
          orchestration.proposedActions?.[0] || {
            id: `act_${crypto.randomUUID()}`,
            type: "SCHEDULE_TASK",
            description: `Schedule task "${task.title}" for ${best.window.startFormatted} – ${best.window.endFormatted}.`,
            target: task.id,
            parameters: {
              taskId: task.id,
              taskTitle: task.title,
              scheduledStart: best.suggestedStart,
              scheduledEnd: best.suggestedEnd,
              strategy: (evaluation as any).chosenStrategy || evaluation.recommendedStrategy,
              fit: best.fit,
              durationMinutes: best.taskDuration,
            },
            riskLevel: "low",
            requiresConfirmation: true,
          };

        // Enforce safety invariant: Proposal only, requires explicit confirmation
        proposedAction.requiresConfirmation = true;

        return res.json({
          success: true,
          hasFeasibleWindow: true,
          recommendation: {
            taskId: task.id,
            taskTitle: task.title,
            scheduledStart: best.suggestedStart,
            scheduledEnd: best.suggestedEnd,
            timeFormatted: `${best.window.startFormatted} – ${best.window.endFormatted}`,
            durationMinutes: best.taskDuration,
            strategy: (evaluation as any).chosenStrategy || evaluation.recommendedStrategy,
            confidence: Math.round((evaluation.confidence || best.score) * 100),
            rationale:
              evaluation.reasoning ||
              (evaluation as any).rationale ||
              best.reasons?.join(" ") ||
              "Optimal scheduling window.",
            tradeoffs: evaluation.tradeoffs || [],
            alternatives,
          },
          action: proposedAction,
          summary: schedOutput.summary || `Recommended window ${best.window.startFormatted} – ${best.window.endFormatted}.`,
        });
      }

      // No feasible window found
      const unassigned = schedOutput.unassignedTasks?.find((u) => u.taskId === task.id);
      return res.json({
        success: true,
        hasFeasibleWindow: false,
        recommendation: null,
        unassignedReason:
          unassigned?.reason ||
          "No suitable window found within your working hours and availability constraints.",
        action: null,
        summary: schedOutput.summary || "No suitable window found for this task.",
      });
    } catch (err: any) {
      console.error("Schedule analyze endpoint error:", err);
      res.status(500).json({ error: err.message || "Failed to schedule task." });
    }
  };

  app.post("/api/nova/schedule", requireAuth, handleScheduleAnalyze);
  app.post("/api/nova/schedule/analyze", requireAuth, handleScheduleAnalyze);

  // Discovery: List Registered Tools (Day 5C.1)
  app.get("/api/nova/tools", requireAuth, (_req, res) => {
    try {
      const tools = toolRegistry.list();
      res.json({ success: true, tools });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to list tools." });
    }
  });

  // Protected Tool Execution Boundary (Day 5C.1)
  app.post("/api/nova/tools/execute", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;

      // 1. Strictly forbid client-supplied foreign userId
      if (req.body?.userId && req.body.userId !== user.id) {
        return res.status(400).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Access Denied: Specifying or spoofing a foreign userId is strictly forbidden.",
        });
      }

      // 2. Reject arbitrary code execution attempts, dynamic modules, or shell commands
      const bodyStr = JSON.stringify(req.body || {}).toLowerCase();
      const disallowedPatterns = [
        "<script",
        "javascript:",
        "eval(",
        "process.exit",
        "require(",
        "import(",
        "child_process",
        "spawn(",
        "exec(",
        "__proto__",
        "constructor",
      ];
      for (const pattern of disallowedPatterns) {
        if (bodyStr.includes(pattern)) {
          return res.status(400).json({
            success: false,
            error: "INVALID_PARAMETERS",
            message: "Disallowed code execution or dangerous injection pattern detected.",
          });
        }
      }

      const { toolId, actionId, actionType, parameters, confirmed, sourceAgentId } = req.body || {};

      if (!toolId || typeof toolId !== "string" || !toolId.trim()) {
        return res.status(400).json({
          success: false,
          error: "TOOL_NOT_FOUND",
          message: "toolId string is required.",
        });
      }

      // Execute through ToolManager
      const result = await toolManager.execute({
        executionId: `exec_${crypto.randomUUID()}`,
        actionId: typeof actionId === "string" ? actionId.trim() : undefined,
        actionType: typeof actionType === "string" ? actionType.trim() : undefined,
        toolId: toolId.trim(),
        userId: user.id, // Strictly server session user ID!
        parameters: parameters && typeof parameters === "object" && !Array.isArray(parameters) ? parameters : {},
        confirmed: confirmed === true,
        sourceAgentId: typeof sourceAgentId === "string" ? sourceAgentId.trim() : undefined,
      });

      if (!result.success) {
        const statusCode =
          result.errorCode === "UNAUTHENTICATED" || result.errorCode === "UNAUTHORIZED"
            ? 403
            : result.errorCode === "RESOURCE_NOT_FOUND" || result.errorCode === "TOOL_NOT_FOUND"
            ? 404
            : 400;
        return res.status(statusCode).json(result);
      }

      return res.json({ success: true, result });
    } catch (err: any) {
      console.error("POST /api/nova/tools/execute error:", err);
      res.status(500).json({
        success: false,
        error: "TOOL_EXECUTION_FAILED",
        message: "An internal error occurred during tool execution.",
      });
    }
  });

  // Protected Recovery Diagnosis & Deliberation Endpoint (Day 5C.3)
  // Strictly proposals and analysis only. ZERO autonomous retry or execution.
  app.post("/api/nova/recovery/analyze", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;

      // 1. Enforce payload size limit (<64KB)
      const rawBody = req.body || {};
      const payloadStr = JSON.stringify(rawBody);
      if (payloadStr.length > 64 * 1024) {
        return res.status(413).json({
          success: false,
          error: "PAYLOAD_TOO_LARGE",
          message: "Failure context payload exceeds 64KB size limit.",
        });
      }

      // 2. Reject client-supplied foreign userId
      if (rawBody.userId && rawBody.userId !== user.id) {
        return res.status(400).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Access Denied: Specifying or spoofing a foreign userId is strictly forbidden.",
        });
      }

      // 3. Reject arbitrary code execution or dangerous injection patterns
      const disallowedPatterns = [
        "<script",
        "javascript:",
        "eval(",
        "process.exit",
        "child_process",
        "spawn(",
        "exec(",
        "__proto__",
        "constructor",
      ];
      const lowerPayload = payloadStr.toLowerCase();
      for (const pattern of disallowedPatterns) {
        if (lowerPayload.includes(pattern)) {
          return res.status(400).json({
            success: false,
            error: "INVALID_PARAMETERS",
            message: "Disallowed code execution or dangerous injection pattern detected.",
          });
        }
      }

      // 4. Validate failure context existence
      const failureCandidate =
        rawBody.failureContext ||
        rawBody.recoveryContext ||
        rawBody.failure ||
        (rawBody.failureCode ? rawBody : null);

      if (!failureCandidate || typeof failureCandidate !== "object") {
        return res.status(400).json({
          success: false,
          error: "INVALID_FAILURE_CONTEXT",
          message: "Structured failure context with failureCode and execution details is required.",
        });
      }

      // 5. Verify cross-user resource security if taskId is provided
      const rawTaskId =
        failureCandidate.actionParametersSafe?.taskId ||
        failureCandidate.parameters?.taskId ||
        failureCandidate.taskId;

      if (rawTaskId && typeof rawTaskId === "string") {
        const existingTask = await getTaskById(user.id, rawTaskId.trim());
        if (!existingTask || existingTask.userId !== user.id) {
          return res.status(404).json({
            success: false,
            error: "RESOURCE_NOT_FOUND",
            message: "Referenced resource does not exist or does not belong to the authenticated user.",
          });
        }
      }

      // 6. Build execution request for RecoveryAgent via Orchestrator
      const agentRequest: AgentRequest = {
        requestId: `req_${crypto.randomUUID()}`,
        userRequest:
          typeof rawBody.userRequest === "string"
            ? rawBody.userRequest
            : "Analyze execution failure and recommend recovery",
        preferredAgentId: "agent.recovery",
        scope: {
          includeTasks: true,
          includeAvailability: true,
          includeCalendar: true,
        },
        parameters: {
          recoveryContext: failureCandidate,
        },
      };

      const orchestration = await novaOrchestrator.orchestrate(agentRequest, {
        userId: user.id, // Strictly authenticated user!
      });

      const recoveryResult = orchestration.agentResults.find(
        (r) => r.agentId === "agent.recovery"
      );

      if (!recoveryResult || !recoveryResult.success) {
        const errorMsg =
          recoveryResult?.errors?.[0]?.message ||
          orchestration.error?.message ||
          "Recovery analysis failed.";
        return res.status(400).json({
          success: false,
          error: "RECOVERY_ANALYSIS_FAILED",
          message: errorMsg,
        });
      }

      const output = recoveryResult.output as any;

      return res.json({
        success: true,
        executionId: output.executionId,
        failureCategory: output.failureCategory,
        recoverable: output.recoverable,
        recommendedRecovery: output.recommendedRecovery,
        confidence: output.confidence,
        requiresUserInput: output.requiresUserInput,
        rationale: output.rationale,
        fingerprint: output.fingerprint,
        proposedActions: recoveryResult.actions || output.proposedActions || [],
        warnings: recoveryResult.warnings || output.warnings || [],
        summary: output.summary || "Failure analysis complete.",
      });
    } catch (err: any) {
      console.error("POST /api/nova/recovery/analyze error:", err);
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "An error occurred during recovery analysis.",
      });
    }
  });

  // ==========================================
  // Chief of Staff Execution Workflow API (Day 5C.5)
  // ==========================================

  // 1. POST /api/nova/workflow - Start workflow
  app.post("/api/nova/workflow", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      if (req.body?.userId && req.body.userId !== user.id) {
        return res.status(400).json({
          error: "Access Denied: Specifying a foreign userId is strictly forbidden.",
        });
      }

      const { userRequest, preferredIntent, targetDate, taskId, parameters } = req.body || {};
      if (!userRequest || typeof userRequest !== "string" || !userRequest.trim()) {
        return res.status(400).json({ error: "userRequest string is required." });
      }

      const workflow = await chiefOfStaffWorkflow.startWorkflow(
        {
          userRequest: userRequest.trim(),
          preferredIntent,
          targetDate,
          taskId,
          parameters,
        },
        { userId: user.id }
      );

      res.json({
        success: workflow.state !== 'ABORTED' && workflow.state !== 'FAILED',
        workflow,
      });
    } catch (err: any) {
      console.error("POST /api/nova/workflow error:", err);
      res.status(500).json({ error: err.message || "Failed to start workflow." });
    }
  });

  // 2. POST /api/nova/workflow/:workflowId/confirm - Confirm awaiting action & execute
  app.post("/api/nova/workflow/:workflowId/confirm", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { workflowId } = req.params;
      if (req.body?.userId && req.body.userId !== user.id) {
        return res.status(400).json({
          error: "Access Denied: Specifying a foreign userId is strictly forbidden.",
        });
      }

      const { actionId, bindingId, parameters } = req.body || {};
      if (!actionId || typeof actionId !== "string") {
        return res.status(400).json({ error: "actionId is required." });
      }

      const workflow = await chiefOfStaffWorkflow.confirmAction(
        workflowId,
        { actionId, bindingId, parameters },
        { userId: user.id }
      );

      res.json({
        success: workflow.state === 'COMPLETED' || workflow.state === 'AWAITING_CONFIRMATION',
        workflow,
      });
    } catch (err: any) {
      console.error("POST /api/nova/workflow/:workflowId/confirm error:", err);
      const isSecurityOrClient =
        err.message?.includes('expired') ||
        err.message?.includes('invalid') ||
        err.message?.includes('modified') ||
        err.message?.includes('mismatch') ||
        err.message?.includes('not found') ||
        err.message?.includes('Security violation');
      res.status(isSecurityOrClient ? 400 : 500).json({
        success: false,
        error: err.message || "Failed to confirm workflow action.",
      });
    }
  });

  // 3. POST /api/nova/workflow/:workflowId/reject - Reject awaiting action
  app.post("/api/nova/workflow/:workflowId/reject", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { workflowId } = req.params;
      if (req.body?.userId && req.body.userId !== user.id) {
        return res.status(400).json({
          error: "Access Denied: Specifying a foreign userId is strictly forbidden.",
        });
      }

      const { actionId, reason } = req.body || {};
      const workflow = await chiefOfStaffWorkflow.rejectAction(
        workflowId,
        { actionId, reason },
        { userId: user.id }
      );

      res.json({
        success: true,
        workflow,
      });
    } catch (err: any) {
      console.error("POST /api/nova/workflow/:workflowId/reject error:", err);
      res.status(400).json({ error: err.message || "Failed to reject workflow action." });
    }
  });

  // 4. POST /api/nova/workflow/:workflowId/edit - Edit action parameters & re-review
  app.post("/api/nova/workflow/:workflowId/edit", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { workflowId } = req.params;
      if (req.body?.userId && req.body.userId !== user.id) {
        return res.status(400).json({
          error: "Access Denied: Specifying a foreign userId is strictly forbidden.",
        });
      }

      const { actionId, updatedParameters } = req.body || {};
      if (!actionId || !updatedParameters || typeof updatedParameters !== "object") {
        return res.status(400).json({ error: "actionId and updatedParameters are required." });
      }

      const workflow = await chiefOfStaffWorkflow.editAction(
        workflowId,
        { actionId, updatedParameters },
        { userId: user.id }
      );

      res.json({
        success: workflow.state === 'AWAITING_CONFIRMATION',
        workflow,
      });
    } catch (err: any) {
      console.error("POST /api/nova/workflow/:workflowId/edit error:", err);
      res.status(400).json({ error: err.message || "Failed to edit workflow action." });
    }
  });

  // 5. GET /api/nova/workflow/:workflowId - Fetch workflow state
  app.get("/api/nova/workflow/:workflowId", requireAuth, async (req, res) => {
    try {
      const user = (req as express.Request & { user: AuthUser }).user;
      const { workflowId } = req.params;

      const workflow = chiefOfStaffWorkflow.getWorkflow(workflowId, { userId: user.id });
      if (!workflow) {
        return res.status(404).json({ error: `Workflow "${workflowId}" not found or unauthorized.` });
      }

      res.json({
        success: true,
        workflow,
      });
    } catch (err: any) {
      console.error("GET /api/nova/workflow/:workflowId error:", err);
      res.status(500).json({ error: "Failed to retrieve workflow." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Sentinel Nova server running on port ${PORT}`));
}

startServer();
