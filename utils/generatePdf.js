const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

async function generatePDF({ html, fileName }) {
  try {
    console.log("STEP 6: Launching Puppeteer");

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    console.log("STEP 7: Setting HTML content");

    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    const dir = path.join("uploads", "reports");

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, fileName);

    console.log("STEP 8: Generating PDF");

    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true
    });

    await browser.close();

    console.log("STEP 9: PDF DONE");

    return filePath;

  } catch (err) {
    console.error("PUPPETEER ERROR:", err);
    throw err;
  }
}

module.exports = generatePDF;