/* eslint max-len: ["error", { "code": 180 }] */
const admin = require("firebase-admin");
const xlsx = require("xlsx");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();


const FILE_NAME = "data.xlsx";
const COLLECTION_NAME = "secrets";

/**
 * Зчитує дані з Excel файлу та оновлює базу даних Firestore.
 * Зберігає існуючі прив'язки користувачів.
 */
async function importData() {
  try {
    const workbook = xlsx.readFile(FILE_NAME);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = xlsx.utils.sheet_to_json(sheet);

    console.log(`Found records: ${data.length}...`);

    const batchSize = 400;
    let batch = db.batch();
    let count = 0;
    let totalUpdated = 0;

    for (const row of data) {
      const docId = String(row["EIC-код"]); // Уникальный ключ записи станет ID документа

      if (!docId) {
        console.warn("Skipping row with missing EIC-code:", row);
        continue;
      }

      const docRef = db.collection(COLLECTION_NAME).doc(docId);

      const record = {
        Ncontract: String(row["№ договору"]),
        account: String(row["Особовий рахунок"]),
        sum: row["ВСЬОГО"],
        tax_pdfo: row["Податок з доходів фізичних осіб"],
        tax_army: row["Військовий збір"],
        sumtopay: row["На рахунок споживача"],
        contragent: row["Контрагент"],
        electricity: row["ПОКУПКА"],
      };

      // { merge: true } оновлює поля, не перезаписуючи весь документ
      batch.set(docRef, record, {merge: true});

      count++;
      totalUpdated++;

      if (count >= batchSize) {
        await batch.commit();
        console.log(`Added ${totalUpdated} fields...`);
        batch = db.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    console.log(`Added/updated ${totalUpdated} fildes`);
  } catch (error) {
    console.error("Import error:", error);
  }
}

importData();
