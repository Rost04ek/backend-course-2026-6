const express = require("express");
const { program } = require("commander");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const http = require("http");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

program
  .requiredOption("-h, --host <host>", "адреса сервера")
  .requiredOption("-p, --port <port>", "порт сервера")
  .requiredOption("-c, --cache <cache>", "шлях до директорії кеша");

program.parse(process.argv);
const options = program.opts();

// --- Налаштування Swagger ---
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Inventory API",
      version: "1.0.0",
      description: "API для керування інвентарем (лабораторна робота)",
    },
    servers: [
      {
        url: `http://${options.host}:${options.port}`,
      },
    ],
  },
  // Змінюємо на абсолютний шлях до поточного файлу
  apis: [path.resolve(__filename)],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

console.log("Swagger paths found:", Object.keys(swaggerSpec.paths).length);

const cacheDir = path.resolve(options.cache);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const dbPath = path.join(cacheDir, "inventory.json");
let inventoryDB = [];
if (fs.existsSync(dbPath)) {
  inventoryDB = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
}
const saveDB = () =>
  fs.writeFileSync(dbPath, JSON.stringify(inventoryDB, null, 2));

const app = express();
const upload = multer({ dest: cacheDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @openapi
 * /inventory:
 *   get:
 *     summary: Отримати весь список інвентарю
 *     tags: [Inventory]
 *     responses:
 *       200:
 *         description: Масив об'єктів інвентарю
 */
app.get("/inventory", (req, res) => {
  const list = inventoryDB.map((item) => ({
    ...item,
    photoUrl: item.photo
      ? `http://${options.host}:${options.port}/inventory/${item.id}/photo`
      : null,
  }));
  res.status(200).json(list);
});

/**
 * @openapi
 * /register:
 *   post:
 *     summary: Реєстрація нового предмета
 *     tags: [Actions]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Предмет успішно створено
 */
app.post("/register", upload.single("photo"), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) return res.status(400).send("Bad Request");

  const newItem = {
    id: Date.now().toString(),
    inventory_name,
    description: description || "",
    photo: req.file ? req.file.filename : null,
  };

  inventoryDB.push(newItem);
  saveDB();
  res.status(201).json(newItem);
});

/**
 * @openapi
 * /inventory/{id}:
 *   get:
 *     summary: Отримати за ID
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Оновити дані
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Видалити
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
app.get("/inventory/:id", (req, res) => {
  const item = inventoryDB.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).send("Not found");
  res.status(200).json(item);
});

app.put("/inventory/:id", (req, res) => {
  const itemIndex = inventoryDB.findIndex((i) => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send("Not found");
  const { inventory_name, description } = req.body;
  if (inventory_name) inventoryDB[itemIndex].inventory_name = inventory_name;
  saveDB();
  res.status(200).json(inventoryDB[itemIndex]);
});

app.delete("/inventory/:id", (req, res) => {
  const itemIndex = inventoryDB.findIndex((i) => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send("Not found");
  inventoryDB.splice(itemIndex, 1);
  saveDB();
  res.status(200).send("Deleted");
});

/**
 * @openapi
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Image
 */
app.get("/inventory/:id/photo", (req, res) => {
  const item = inventoryDB.find((i) => i.id === req.params.id);
  if (!item || !item.photo) return res.status(404).send("Not found");
  res.sendFile(path.join(cacheDir, item.photo));
});

/**
 * @openapi
 * /search:
 *   post:
 *     summary: Пошук
 *     tags: [Actions]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Found
 */
app.post("/search", (req, res) => {
  const item = inventoryDB.find((i) => i.id === req.body.id);
  if (!item) return res.status(404).send("Not found");
  res.status(200).json(item);
});

app.get("/RegisterForm.html", (req, res) =>
  res.sendFile(path.join(__dirname, "RegisterForm.html")),
);
app.get("/SearchForm.html", (req, res) =>
  res.sendFile(path.join(__dirname, "SearchForm.html")),
);

const server = http.createServer(app);
server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://${options.host}:${options.port}`);
  console.log(`Swagger: http://${options.host}:${options.port}/docs`);
});
