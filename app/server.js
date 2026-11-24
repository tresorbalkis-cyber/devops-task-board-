const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const client = require("prom-client");

const app = express();
const port = Number(process.env.PORT) || 5111;
const dataFile = process.env.DATA_FILE || path.join(__dirname, "tasks.json");
const dataDirectory = path.dirname(dataFile);

fs.mkdirSync(dataDirectory, { recursive: true });
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, "[]\n", "utf8");
}

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpRequests = new client.Counter({
  name: "app_http_requests_total",
  help: "Nombre de requêtes HTTP reçues par l'application",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

const tasksCreated = new client.Counter({
  name: "app_tasks_created_total",
  help: "Nombre de tâches créées",
  registers: [registry],
});

app.use((req, res, next) => {
  res.on("finish", () => {
    httpRequests.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: String(res.statusCode),
    });
  });
  next();
});

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

function readTasks() {
  const tasks = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  if (!Array.isArray(tasks)) {
    throw new Error("Le fichier de tâches doit contenir un tableau JSON.");
  }
  return tasks;
}

function writeTasks(tasks) {
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryFile, dataFile);
}

app.get("/api/tasks", (req, res, next) => {
  try {
    res.json(readTasks());
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", (req, res, next) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title || title.length > 200) {
    return res.status(400).json({ error: "Le titre doit contenir de 1 à 200 caractères." });
  }

  try {
    const tasks = readTasks();
    const task = { id: randomUUID(), title, completed: false, createdAt: new Date().toISOString() };
    tasks.push(task);
    writeTasks(tasks);
    tasksCreated.inc();
    return res.status(201).json(task);
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/tasks/:id", (req, res, next) => {
  if (typeof req.body?.completed !== "boolean") {
    return res.status(400).json({ error: "Le champ completed doit être un booléen." });
  }

  try {
    const tasks = readTasks();
    const task = tasks.find((item) => item.id === req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Tâche introuvable." });
    }

    task.completed = req.body.completed;
    writeTasks(tasks);
    return res.json(task);
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/tasks/:id", (req, res, next) => {
  try {
    const tasks = readTasks();
    const remainingTasks = tasks.filter((item) => item.id !== req.params.id);
    if (remainingTasks.length === tasks.length) {
      return res.status(404).json({ error: "Tâche introuvable." });
    }

    writeTasks(remainingTasks);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

app.get("/metrics", async (req, res, next) => {
  try {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({ error: "Une erreur interne est survenue." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`DevOps Task Board disponible sur le port ${port}`);
});
