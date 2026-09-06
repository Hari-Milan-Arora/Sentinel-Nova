import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

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

function getSession(req: express.Request) {
  const raw = req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(`${AUTH_COOKIE}=`))?.slice(AUTH_COOKIE.length + 1);
  return verifySession(raw);
}

function setSession(res: express.Response, user: AuthUser) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=${signSession(user)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${secure}`);
}

function clearSession(res: express.Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getSession(req);
  if (!user) return res.status(401).json({ error: "Authentication required." });
  (req as express.Request & { user: AuthUser }).user = user;
  next();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/auth/me", (req, res) => {
    const user = getSession(req);
    if (!user) return res.status(401).json({ user: null });
    res.json({ user });
  });

  app.post("/api/auth/google", async (req, res) => {
    try {
      const { credential } = req.body as { credential?: string };
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) return res.status(503).json({ error: "Google authentication is not configured on the server." });
      if (!credential) return res.status(400).json({ error: "Missing Google credential." });

      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!response.ok) return res.status(401).json({ error: "Google credential could not be verified." });
      const token = await response.json() as { aud?: string; sub?: string; email?: string; email_verified?: string; name?: string; picture?: string; exp?: string };
      if (token.aud !== clientId || !token.sub || !token.email || token.email_verified !== "true") return res.status(401).json({ error: "Google identity verification failed." });
      if (token.exp && Number(token.exp) < Math.floor(Date.now() / 1000)) return res.status(401).json({ error: "Google credential has expired." });

      const user: AuthUser = { id: token.sub, email: token.email, name: token.name || token.email.split("@")[0], picture: token.picture };
      setSession(res, user);
      res.json({ user });
    } catch (error) {
      console.error("Google auth failed:", error);
      res.status(500).json({ error: "Unable to complete Google sign-in." });
    }
  });

  app.post("/api/auth/logout", (req, res) => { clearSession(res); res.status(204).send(); });

  app.post("/api/chat", requireAuth, async (req, res) => {
    const { message, tasks, goals } = req.body;
    try {
      let responseContent = "";
      let hasGemini = false;
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const systemContext = `You are Sentinel Nova, an AI Chief of Staff. Think before acting, prioritize clearly, explain uncertainty, and keep recommendations concise.\n\nActive Tasks: ${JSON.stringify(tasks || [])}\nTarget Goals: ${JSON.stringify(goals || [])}\n\nUser message: "${message}"`;
          const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: systemContext });
          if (response.text) { responseContent = response.text; hasGemini = true; }
        } catch (geminiError) { console.error("Gemini invocation failed:", geminiError); }
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
