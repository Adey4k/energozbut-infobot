// index.js
const {Telegraf, session} = require("telegraf");
const {onRequest} = require("firebase-functions/v2/https");
const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Вмикаємо сесії
bot.use(session());

const commandsPath = path.join(__dirname, "commands");
fs.readdirSync(commandsPath).forEach((file) => {
  if (file.endsWith(".js")) {
    const commandModule = require(path.join(commandsPath, file));
    if (typeof commandModule === "function") {
      commandModule(bot);
    }
  }
});

const app = express();
app.use(express.json());
app.use(bot.webhookCallback("/webhook"));

exports.bot = onRequest(app);
