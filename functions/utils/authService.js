/* eslint max-len: ["error", { "code": 180 }] */
const admin = require("firebase-admin");

// Ініціалізація тільки якщо ще не була зроблена
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const BAN_MESSAGE = "🚫 Помічена підозріла активність. Спробу входу заблоковано. Зв'яжіться з технічною підтримкою.";

/**
   * Отримує фінансові дані з колекції secrets.
   * @param {string} docId - ID документа, який потрібно знайти.
   * @return {Promise<Object|null>} Дані документа або null.
   */
async function getUserData(docId) {
  if (!docId) return null;
  const doc = await db.collection("secrets").doc(docId).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Основна функція перевірки
 * @param {number} userId - Telegram ID
 * @param {string} Ncontract - Номер договору
 * @param {string} account - Особовий рахунок
 */
async function checkAndLinkUser(userId, Ncontract, account) {
  const userRef = db.collection("users").doc(String(userId));

  // 1. Отримуємо статус користувача
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {attempts: 0, isBanned: false, linkedDocId: null};

  // Якщо заблокований
  if (userData.isBanned) return {success: false, message: BAN_MESSAGE, isBanned: true};

  // Якщо вже авторизований
  if (userData.linkedDocId) return {success: true, message: "✅ Ви вже авторизовані, і не можете змінити свої дані", alreadyLinked: true};

  // 2. Шукаємо збіг у базі secrets (Договір + Рахунок)
  const secretsRef = db.collection("secrets");
  const snapshot = await secretsRef
      .where("Ncontract", "==", Ncontract)
      .where("account", "==", account)
      .limit(1)
      .get();

  let validDoc = null;

  // Перевіряємо, чи знайшли запис і чи він вільний
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const data = doc.data();
    // Якщо поле usedBy порожнє або дорівнює нашому ID (на випадок повторного входу)
    if (!data.usedBy || data.usedBy === userId) {
      validDoc = doc;
    }
  }

  // 3. Сценарій: НЕВДАЧА
  if (!validDoc) {
    const newAttempts = (userData.attempts || 0) + 1;

    if (newAttempts >= 5) {
      await userRef.set({attempts: newAttempts, isBanned: true}, {merge: true});
      return {success: false, message: BAN_MESSAGE, isBanned: true};
    }

    await userRef.set({attempts: newAttempts}, {merge: true});
    return {success: false, message: `❌ Невірні дані або вони вже використовуються іншим користувачем.`};
  }

  // 4. Сценарій: УСПІХ -> Прив'язка
  const batch = db.batch();

  // Оновлюємо користувача (скидаємо спроби, записуємо ID документа secrets)
  batch.set(userRef, {
    linkedDocId: validDoc.id,
    attempts: 0,
    registeredAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});

  // Блокуємо запис у secrets за цим користувачем
  batch.update(validDoc.ref, {
    usedBy: userId,
    usedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();
  const data = await getUserData(validDoc.id);
  return {success: true, message: "✅ Авторизація успішна! Ласкаво просимо, " + data.contragent + "!"};
}

module.exports = {checkAndLinkUser, BAN_MESSAGE};
