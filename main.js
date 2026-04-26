const express = require('express');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');

program
  .requiredOption('-h, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <cache>', 'шлях до директорії кеша');

program.parse(process.argv);
const options = program.opts();

const cacheDir = path.resolve(options.cache);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const dbPath = path.join(cacheDir, 'inventory.json');
let inventoryDB = [];
if (fs.existsSync(dbPath)) {
  inventoryDB = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}
const saveDB = () => fs.writeFileSync(dbPath, JSON.stringify(inventoryDB, null, 2));

const app = express();
const upload = multer({ dest: cacheDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/RegisterForm.html', (req, res) => res.sendFile(path.join(__dirname, 'RegisterForm.html')));
app.get('/SearchForm.html', (req, res) => res.sendFile(path.join(__dirname, 'SearchForm.html')));

app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) {
    return res.status(400).send('Bad Request: inventory_name is required');
  }

  const newItem = {
    id: Date.now().toString(),
    inventory_name,
    description: description || '',
    photo: req.file ? req.file.filename : null
  };

  inventoryDB.push(newItem);
  saveDB();
  res.status(201).json(newItem);
});
app.all('/register', (req, res) => res.status(405).send('Method not allowed'));

app.get('/inventory', (req, res) => {
  const list = inventoryDB.map(item => ({
    ...item,
    photoUrl: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
  }));
  res.status(200).json(list);
});
app.all('/inventory', (req, res) => res.status(405).send('Method not allowed'));

app.get('/inventory/:id', (req, res) => {
  const item = inventoryDB.find(i => i.id === req.params.id);
  if (!item) return res.status(404).send('Not found');
  res.status(200).json({
    ...item,
    photoUrl: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
  });
});

app.put('/inventory/:id', (req, res) => {
  const itemIndex = inventoryDB.findIndex(i => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send('Not found');

  const { inventory_name, description } = req.body;
  if (inventory_name) inventoryDB[itemIndex].inventory_name = inventory_name;
  if (description !== undefined) inventoryDB[itemIndex].description = description;

  saveDB();
  res.status(200).json(inventoryDB[itemIndex]);
});

app.delete('/inventory/:id', (req, res) => {
  const itemIndex = inventoryDB.findIndex(i => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send('Not found');

  const item = inventoryDB[itemIndex];
  if (item.photo) {
    const photoPath = path.join(cacheDir, item.photo);
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
  }

  inventoryDB.splice(itemIndex, 1);
  saveDB();
  res.status(200).send('Deleted successfully');
});
app.all('/inventory/:id', (req, res) => res.status(405).send('Method not allowed'));

app.get('/inventory/:id/photo', (req, res) => {
  const item = inventoryDB.find(i => i.id === req.params.id);
  if (!item || !item.photo) return res.status(404).send('Not found');

  const photoPath = path.join(cacheDir, item.photo);
  if (!fs.existsSync(photoPath)) return res.status(404).send('Not found');

  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(photoPath, { dotfiles: 'allow' });
});

app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
  const itemIndex = inventoryDB.findIndex(i => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send('Not found');
  if (!req.file) return res.status(400).send('Bad Request: photo is required');

  const oldPhoto = inventoryDB[itemIndex].photo;
  if (oldPhoto) {
    const oldPath = path.join(cacheDir, oldPhoto);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  inventoryDB[itemIndex].photo = req.file.filename;
  saveDB();
  res.status(200).send('Photo updated');
});
app.all('/inventory/:id/photo', (req, res) => res.status(405).send('Method not allowed'));

app.post('/search', (req, res) => {
  const { id, has_photo } = req.body;
  const item = inventoryDB.find(i => i.id === id);
  if (!item) return res.status(404).send('Not found');

  let responseData = { ...item };
  if (has_photo === 'on' && item.photo) {
    responseData.description += ` (Photo URL: http://${options.host}:${options.port}/inventory/${item.id}/photo)`;
  }

  res.status(200).json(responseData);
});
app.all('/search', (req, res) => res.status(405).send('Method not allowed'));

const server = http.createServer(app);
server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://${options.host}:${options.port}`);
  console.log(`Cache directory: ${cacheDir}`);
});