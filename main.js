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

const server = http.createServer(app);
server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://${options.host}:${options.port}`);
  console.log(`Cache directory: ${cacheDir}`);
});