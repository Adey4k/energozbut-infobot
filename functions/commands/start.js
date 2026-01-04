/* eslint-disable max-len */
const {Markup} = require("telegraf");
const {message} = require("telegraf/filters");
const admin = require("firebase-admin");
const {checkAndLinkUser, BAN_MESSAGE} = require("../utils/authService");

const db = admin.firestore();

module.exports = (bot) => {
  const mainMenu = Markup.keyboard([
    ["Переглянути нарахування"],
    ["Переглянути податки"],
    ["Сума до виплати"],
    ["Зв'язатися з підтримкою"],
  ]).resize();

  /**
   * Форматує число у грошовий вигляд.
   * @param {string|number} value - Значення.
   * @return {string} Відформатоване число.
   */
  function formatCurrency(value) {
    if (!value) return "0.00";
    const num = parseFloat(String(value).replace(/,/g, ""));
    if (isNaN(num)) return "0.00";
    return num.toFixed(2);
  }

  /**
   * Відновлення сесії через базу даних.
   * @param {Object} ctx - Контекст.
   * @return {Promise<string|null>} ID документа.
   */
  async function getOrRestoreAuth(ctx) {
    // 1. Пам'ять
    if (ctx.session && ctx.session.linkedDocId) {
      return ctx.session.linkedDocId;
    }

    // 2. База даних
    try {
      // Важливо: перетворюємо ID в String, бо Firestore зберігає ключі як рядки
      const userDoc = await db.collection("users").doc(String(ctx.from.id)).get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.linkedDocId) {
          // Відновлюємо в пам'ять
          if (!ctx.session) ctx.session = {};
          ctx.session.step = "authorized";
          ctx.session.linkedDocId = userData.linkedDocId;
          return userData.linkedDocId;
        }
      }
    } catch (e) {
      console.error("Помилка відновлення сесії:", e);
    }
    return null;
  }

  /**
   * Отримує дані з secrets.
   * @param {string} docId - ID документа.
   * @return {Promise<Object|null>} Дані.
   */
  async function getUserData(docId) {
    if (!docId) return null;
    const doc = await db.collection("secrets").doc(docId).get();
    return doc.exists ? doc.data() : null;
  }

  // --- 1. START ---
  bot.start(async (ctx) => {
    ctx.session = {step: "waiting_contract"};
    await ctx.reply(
        "Добрий день! Вас вітає ТОВ \"ПОЛТАВАЕНЕРГОЗБУТ\".\n\n" +
        "Для авторизації, будь ласка, введіть **Номер договору**:",
        {parse_mode: "Markdown"},
    );
  });

  // --- ОБРОБНИКИ КНОПОК ---

  bot.hears("Переглянути нарахування", async (ctx) => {
    const docId = await getOrRestoreAuth(ctx);
    if (!docId) return ctx.reply("⚠️ Сесія закінчилася. Будь ласка, введіть /start для авторизації.");

    const data = await getUserData(docId);
    if (!data) return ctx.reply("Помилка доступу до даних.");
    await ctx.reply(
        `Вироблено електроенергії: **${formatCurrency(data.electricity)} кВт*г**\n` +
        `Ваше нарахування: **${formatCurrency(data.sum)} грн**`,
        {parse_mode: "Markdown"},
    );
  });

  bot.hears("Переглянути податки", async (ctx) => {
    const docId = await getOrRestoreAuth(ctx);
    if (!docId) return ctx.reply("⚠️ Сесія закінчилася. Будь ласка, введіть /start для авторизації.");

    const data = await getUserData(docId);
    if (!data) return ctx.reply("Помилка доступу до даних.");

    await ctx.reply(
        `Податок ПДФО: **${formatCurrency(data.tax_fop)} грн**\n` +
        `Військовий збір: **${formatCurrency(data.tax_army)} грн**`,
        {parse_mode: "Markdown"},
    );
  });

  bot.hears("Сума до виплати", async (ctx) => {
    const docId = await getOrRestoreAuth(ctx);
    if (!docId) return ctx.reply("⚠️ Сесія закінчилася. Будь ласка, введіть /start для авторизації.");

    const data = await getUserData(docId);
    if (!data) return ctx.reply("Помилка доступу до даних.");

    await ctx.reply(`💰 Сума до виплати: **${formatCurrency(data.sumtopay)} грн**`, {parse_mode: "Markdown"});
  });

  // Кнопка 4: Підтримка
  bot.hears("Зв'язатися з підтримкою", async (ctx) => {
    await ctx.reply(
        "Якщо у вас виникли питання, зв'яжіться з нашою підтримкою:\n" +
        "📞 Телефон: `0800-307-747` або `(0532) 648-707`\n" +
        "📧 Email: kanc01@energo.pl.ua",
        {parse_mode: "Markdown"},
    );
  });

  // --- 2. ГЛОБАЛЬНИЙ СЛУХАЧ (ТЕПЕР ВІН ЗОВНІ) ---
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text.trim();
    if (!ctx.session) ctx.session = {};

    // Якщо статус невідомий, пробуємо відновити
    if (!ctx.session.step) {
      const docId = await getOrRestoreAuth(ctx);
      if (docId) {
        return ctx.reply(`Ви авторизовані. Будь ласка, скористайтеся кнопками меню нижче. 👇`, mainMenu);
      }
    }

    if (ctx.session.step === "banned") return ctx.reply(BAN_MESSAGE);

    // КРОК 1
    if (ctx.session.step === "waiting_contract") {
      ctx.session.contract = text;
      ctx.session.step = "waiting_account";
      return ctx.reply("Дякуємо. Тепер введіть **Номер особового рахунку**:", {parse_mode: "Markdown"});
    }

    // КРОК 2
    if (ctx.session.step === "waiting_account") {
      const account = text;
      const contract = ctx.session.contract;

      await ctx.reply("🔄 Перевірка даних...");
      const result = await checkAndLinkUser(ctx.from.id, contract, account);

      if (result.success) {
        ctx.session.step = "authorized";
        ctx.session.linkedDocId = result.linkedDocId;
        ctx.session.contract = null;

        return ctx.reply(result.message, mainMenu);
      } else {
        if (result.isBanned) {
          ctx.session.step = "banned";
          return ctx.reply(result.message);
        }

        ctx.session.step = "waiting_contract";
        const errorMsg = result.message + "\n\nСпробуйте ще раз. Введіть **Номер договору**:";
        return ctx.reply(errorMsg, {parse_mode: "Markdown"});
      }
    }

    // Якщо користувач вже авторизований
    if (ctx.session.step === "authorized") {
      return ctx.reply(`Ви авторизовані. Будь ласка, скористайтеся кнопками меню нижче. 👇`, mainMenu);
    }

    // Якщо нічого не підійшло (і відновлення не спрацювало)
    if (!ctx.session.step) {
      return ctx.reply("Введіть /start для початку роботи.");
    }
  });
};
